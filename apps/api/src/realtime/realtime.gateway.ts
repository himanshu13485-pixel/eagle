import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { RT_EVENTS, type LiveFramePayload, type LiveWatchPayload } from "@eagle/shared";

/**
 * Realtime hub for presence, screenshot notifications, and on-demand live screen streaming.
 *
 * Two kinds of clients connect:
 *  - Dashboard viewers: emit `join {orgId}`, then `live.watch {employeeId,on}` to subscribe.
 *  - Agents: connect with `auth.deviceToken`; receive `live.start` / `live.stop`, emit `live.frame`.
 *
 * Live streaming is pull-based: an agent only captures/streams while ≥1 viewer is watching it.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true }, maxHttpBufferSize: 8e6 })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // viewers watching a given employee
  private viewersByEmployee = new Map<string, Set<string>>();
  // device sockets serving a given employee (an employee may have >1 device)
  private deviceSocketsByEmployee = new Map<string, Set<string>>();
  // per-socket metadata
  private deviceMeta = new Map<string, { deviceId: string; employeeId: string; orgId: string }>();
  private viewerOrg = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.deviceToken as string | undefined;
    if (!token) return; // dashboard viewer — authenticates via `join`
    const [deviceId, secret] = token.split(".");
    if (!deviceId || !secret) return client.disconnect();
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device?.enrolled || !device.deviceTokenHash || !bcrypt.compareSync(secret, device.deviceTokenHash)) {
      return client.disconnect();
    }
    this.deviceMeta.set(client.id, {
      deviceId: device.id,
      employeeId: device.employeeId,
      orgId: device.orgId,
    });
    this.addTo(this.deviceSocketsByEmployee, device.employeeId, client.id);
    // If someone is already watching this employee, start immediately.
    if (this.viewersByEmployee.get(device.employeeId)?.size) {
      client.emit(RT_EVENTS.liveStart);
    }
  }

  handleDisconnect(client: Socket) {
    const meta = this.deviceMeta.get(client.id);
    if (meta) {
      this.removeFrom(this.deviceSocketsByEmployee, meta.employeeId, client.id);
      this.deviceMeta.delete(client.id);
      // tell viewers the stream ended
      for (const sid of this.viewersByEmployee.get(meta.employeeId) ?? []) {
        this.server.to(sid).emit(RT_EVENTS.liveEnded, { employeeId: meta.employeeId });
      }
    }
    this.viewerOrg.delete(client.id);
    for (const [employeeId, viewers] of this.viewersByEmployee) {
      if (viewers.delete(client.id) && viewers.size === 0) this.stopDevice(employeeId);
    }
  }

  @SubscribeMessage(RT_EVENTS.join)
  onJoin(@MessageBody() data: { orgId: string }, @ConnectedSocket() client: Socket) {
    if (data?.orgId) {
      client.join(`org:${data.orgId}`);
      this.viewerOrg.set(client.id, data.orgId);
    }
    return { ok: true };
  }

  @SubscribeMessage(RT_EVENTS.liveWatch)
  async onWatch(@MessageBody() data: LiveWatchPayload, @ConnectedSocket() client: Socket) {
    const orgId = this.viewerOrg.get(client.id);
    if (!orgId || !data?.employeeId) return { ok: false };
    // authorize: employee must belong to the viewer's org
    const employee = await this.prisma.employee.findFirst({
      where: { id: data.employeeId, orgId, active: true },
      select: { id: true },
    });
    if (!employee) return { ok: false }; // unknown / deactivated → no live stream

    if (data.on) {
      const first = !(this.viewersByEmployee.get(data.employeeId)?.size);
      this.addTo(this.viewersByEmployee, data.employeeId, client.id);
      if (first) this.startDevice(data.employeeId);
    } else {
      this.removeFrom(this.viewersByEmployee, data.employeeId, client.id);
      if (!this.viewersByEmployee.get(data.employeeId)?.size) this.stopDevice(data.employeeId);
    }
    return { ok: true };
  }

  @SubscribeMessage(RT_EVENTS.liveFrame)
  onFrame(@MessageBody() data: LiveFramePayload, @ConnectedSocket() client: Socket) {
    const meta = this.deviceMeta.get(client.id);
    if (!meta) return;
    const payload: LiveFramePayload = { employeeId: meta.employeeId, ts: data.ts, data: data.data };
    for (const sid of this.viewersByEmployee.get(meta.employeeId) ?? []) {
      this.server.to(sid).emit(RT_EVENTS.liveFrame, payload);
    }
  }

  /** Agent -> viewers: how many monitors this device has. */
  @SubscribeMessage(RT_EVENTS.liveMonitors)
  onMonitors(@MessageBody() data: { count: number }, @ConnectedSocket() client: Socket) {
    const meta = this.deviceMeta.get(client.id);
    if (!meta) return;
    const payload = { employeeId: meta.employeeId, count: Math.max(1, Number(data?.count) || 1) };
    for (const sid of this.viewersByEmployee.get(meta.employeeId) ?? []) {
      this.server.to(sid).emit(RT_EVENTS.liveMonitors, payload);
    }
  }

  /** Viewer -> agent(s): switch which monitor to stream. */
  @SubscribeMessage(RT_EVENTS.liveSetMonitor)
  async onSetMonitor(@MessageBody() data: { employeeId: string; index: number }, @ConnectedSocket() client: Socket) {
    const orgId = this.viewerOrg.get(client.id);
    if (!orgId || !data?.employeeId) return;
    const ok = await this.prisma.employee.findFirst({ where: { id: data.employeeId, orgId }, select: { id: true } });
    if (!ok) return;
    for (const sid of this.deviceSocketsByEmployee.get(data.employeeId) ?? []) {
      this.server.to(sid).emit(RT_EVENTS.liveSetMonitor, { index: Math.max(0, Number(data.index) || 0) });
    }
  }

  /** Presence / screenshot fan-out used by other services. */
  emitToOrg(orgId: string, event: string, payload: unknown) {
    this.server?.to(`org:${orgId}`).emit(event, payload);
  }

  /** On-demand: ask an employee's agent(s) to capture a screenshot right now. */
  requestCapture(employeeId: string): boolean {
    const sockets = this.deviceSocketsByEmployee.get(employeeId);
    for (const sid of sockets ?? []) this.server.to(sid).emit(RT_EVENTS.captureNow);
    return (sockets?.size ?? 0) > 0;
  }

  private startDevice(employeeId: string) {
    for (const sid of this.deviceSocketsByEmployee.get(employeeId) ?? []) {
      this.server.to(sid).emit(RT_EVENTS.liveStart);
    }
  }
  private stopDevice(employeeId: string) {
    for (const sid of this.deviceSocketsByEmployee.get(employeeId) ?? []) {
      this.server.to(sid).emit(RT_EVENTS.liveStop);
    }
  }
  private addTo(map: Map<string, Set<string>>, key: string, val: string) {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(val);
  }
  private removeFrom(map: Map<string, Set<string>>, key: string, val: string) {
    map.get(key)?.delete(val);
    if (map.get(key)?.size === 0) map.delete(key);
  }
}
