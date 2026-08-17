import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { RT_EVENTS, type LiveFramePayload, type LiveMonitorsPayload } from "@eagle/shared";
import { API_URL } from "./api";
import { getAdminToken } from "./adminApi";
import type { LiveFrame } from "./live";

/** A single platform-admin socket authenticated with the admin JWT. */
let socket: Socket | null = null;
function getAdminSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, { transports: ["websocket"], withCredentials: true, auth: { adminToken: getAdminToken() } });
  }
  return socket;
}

export interface AdminLiveState {
  frames: Record<string, LiveFrame>;
  monitors: Record<string, number>;
  setMonitor: (employeeId: string, index: number) => void;
}

/**
 * Cross-client live frames for the admin wall. Mirrors useLiveFrames but rides the
 * admin socket and authorizes each watch server-side via the admin JWT (any client).
 */
export function useAdminLiveFrames(employeeIds: string[]): AdminLiveState {
  const [frames, setFrames] = useState<Record<string, LiveFrame>>({});
  const [monitors, setMonitors] = useState<Record<string, number>>({});
  const watched = useRef<Set<string>>(new Set());
  const key = employeeIds.slice().sort().join(",");

  const setMonitor = useCallback((employeeId: string, index: number) => {
    getAdminSocket().emit("admin.setMonitor", { employeeId, index });
  }, []);

  useEffect(() => {
    const s = getAdminSocket();
    const onFrame = (p: LiveFramePayload) => setFrames((f) => ({ ...f, [p.employeeId]: { data: p.data, ts: p.ts } }));
    const onEnded = (p: { employeeId: string }) => setFrames((f) => { const c = { ...f }; delete c[p.employeeId]; return c; });
    const onMonitors = (p: LiveMonitorsPayload) => setMonitors((m) => ({ ...m, [p.employeeId]: p.count }));
    s.on(RT_EVENTS.liveFrame, onFrame);
    s.on(RT_EVENTS.liveEnded, onEnded);
    s.on(RT_EVENTS.liveMonitors, onMonitors);
    return () => { s.off(RT_EVENTS.liveFrame, onFrame); s.off(RT_EVENTS.liveEnded, onEnded); s.off(RT_EVENTS.liveMonitors, onMonitors); };
  }, []);

  // Reconcile which employees we're watching as the id set changes.
  useEffect(() => {
    const s = getAdminSocket();
    const next = new Set(employeeIds);
    for (const id of next) {
      if (!watched.current.has(id)) { s.emit("admin.watch", { employeeId: id, on: true }); watched.current.add(id); }
    }
    for (const id of Array.from(watched.current)) {
      if (!next.has(id)) {
        s.emit("admin.watch", { employeeId: id, on: false });
        watched.current.delete(id);
        setFrames((f) => { const c = { ...f }; delete c[id]; return c; });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    return () => {
      const s = getAdminSocket();
      for (const id of watched.current) s.emit("admin.watch", { employeeId: id, on: false });
      watched.current.clear();
    };
  }, []);

  return { frames, monitors, setMonitor };
}
