/**
 * Makes Live Monitoring show real-looking screens for the demo org while
 * recording, instead of "Waiting for live frames…" tiles.
 *
 * seed-demo.ts's devices have no agent behind them, so nobody answers the
 * gateway's `live.start`. This script plays the agent's part for the demo org's
 * ACTIVE/IDLE employees: it gives each of their devices a fresh device token
 * (demo org only — the query is pinned to DEMO_ORG_ID), connects to the
 * realtime gateway as that device, and when a viewer starts watching it streams
 * the pre-rendered app mockups from demo-assets/screenshots as live frames,
 * switching app every few seconds like a person working.
 *
 * Run with: npm run demo:live   (from apps/api, alongside the API dev server
 * and demo:keep-alive). Ctrl+C to stop.
 */
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { io, type Socket } from "socket.io-client";

const prisma = new PrismaClient();

const DEMO_ORG_ID = "demo-org-northwind";
const SERVER_URL = process.env.PUBLIC_API_URL || `http://localhost:${process.env.API_PORT || 4000}`;
const FRAME_MS = 1000;
const SWITCH_EVERY_FRAMES = 6;
const MOCKUP_DIR = join(__dirname, "screenshots");

// What each demo employee is "working on" — cycled while someone watches.
const SCREENS: Record<string, string[]> = {
  "Ananya Sharma": ["visual-studio-code", "slack", "github-com"],
  "Rohan Verma": ["cursor", "postman", "linear-app"],
  "Meera Iyer": ["figma", "notion", "microsoft-teams"],
  "Kabir Singh": ["youtube-com", "discord", "reddit-com"],
  "Priya Nair": ["mail-google-com", "docs-google-com", "northwind-crm-internal"],
};

if (!DEMO_ORG_ID.startsWith("demo-")) throw new Error("Refusing to run: DEMO_ORG_ID must stay namespaced under 'demo-'.");

const frameCache = new Map<string, string>();
function frame(slug: string): string {
  let data = frameCache.get(slug);
  if (!data) {
    data = `data:image/png;base64,${readFileSync(join(MOCKUP_DIR, `${slug}.png`)).toString("base64")}`;
    frameCache.set(slug, data);
  }
  return data;
}

async function connectAs(employeeName: string, deviceId: string, employeeId: string): Promise<Socket> {
  const secret = randomBytes(24).toString("hex");
  await prisma.device.update({ where: { id: deviceId }, data: { deviceTokenHash: bcrypt.hashSync(secret, 10) } });

  const socket = io(SERVER_URL, { auth: { deviceToken: `${deviceId}.${secret}` }, transports: ["websocket"], reconnection: true });
  const screens = SCREENS[employeeName];
  let timer: NodeJS.Timeout | null = null;
  let n = 0;

  socket.on("connect", () => console.log(`[live] ${employeeName} connected`));
  socket.on("live.start", () => {
    if (timer) return;
    console.log(`[live] ${employeeName}: viewer attached — streaming`);
    socket.emit("live.monitors", { employeeId, count: 1 });
    const send = () => {
      const slug = screens[Math.floor(n / SWITCH_EVERY_FRAMES) % screens.length];
      socket.emit("live.frame", { employeeId, ts: Date.now(), data: frame(slug) });
      n++;
    };
    send();
    timer = setInterval(send, FRAME_MS);
  });
  socket.on("live.stop", () => {
    if (timer) clearInterval(timer);
    timer = null;
    console.log(`[live] ${employeeName}: viewers gone — stopped`);
  });
  return socket;
}

async function main() {
  const employees = await prisma.employee.findMany({
    where: { orgId: DEMO_ORG_ID, name: { in: Object.keys(SCREENS) } },
    select: { id: true, name: true, devices: { where: { orgId: DEMO_ORG_ID }, select: { id: true }, take: 1 } },
  });
  for (const e of employees) {
    if (e.devices[0]) await connectAs(e.name, e.devices[0].id, e.id);
  }
  console.log(`Streaming demo screens for ${employees.length} employees to ${SERVER_URL}. Ctrl+C to stop.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
