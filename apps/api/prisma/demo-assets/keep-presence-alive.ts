/**
 * Keeps the demo org's ACTIVE/IDLE employees looking "live" while the API
 * server is running against seed-demo.ts's data.
 *
 * PresenceService (src/devices/presence.service.ts) sweeps every 30s and
 * flips any employee to OFFLINE once 2 minutes pass without a device
 * heartbeat — correct behavior for real agents, but seed-demo.ts's synthetic
 * employees never send one. Without this, every seeded employee goes OFFLINE
 * within ~2 minutes of the API starting, which breaks the Live Monitoring /
 * dashboard presence demo. This mimics a heartbeat for exactly the employees
 * seed-demo.ts intended to be ACTIVE or IDLE (OFFLINE ones are left alone —
 * that's already their resting state).
 *
 * Run with: npm run demo:keep-alive   (from apps/api, alongside the API dev server)
 * Ctrl+C to stop.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_ORG_ID = "demo-org-northwind";
const INTERVAL_MS = 45_000;

// Mirrors the EMPLOYEES table in seed-demo.ts — kept as a small standalone
// list here rather than importing that script, since this tool's job is
// purely to sustain presence, not to know about shifts/teams/categories.
const INTENDED_PRESENCE: Record<string, "ACTIVE" | "IDLE"> = {
  "Ananya Sharma": "ACTIVE",
  "Rohan Verma": "ACTIVE",
  "Meera Iyer": "ACTIVE",
  "Kabir Singh": "IDLE",
  "Priya Nair": "IDLE",
};

async function tick() {
  const now = new Date();
  const employees = await prisma.employee.findMany({
    where: { orgId: DEMO_ORG_ID, name: { in: Object.keys(INTENDED_PRESENCE) } },
    select: { id: true, name: true, devices: { select: { id: true } } },
  });

  for (const e of employees) {
    const status = INTENDED_PRESENCE[e.name];
    if (!status) continue;
    await prisma.employee.update({
      where: { id: e.id },
      data: { status, ...(status === "ACTIVE" ? { lastActiveAt: now } : {}) },
    });
    for (const d of e.devices) {
      await prisma.device.update({ where: { id: d.id }, data: { lastSeenAt: now, status } });
    }
  }
  console.log(`[keep-alive] ${now.toISOString()} refreshed ${employees.length} employees`);
}

async function main() {
  console.log(`Keeping ${Object.keys(INTENDED_PRESENCE).length} demo employees "live" every ${INTERVAL_MS / 1000}s. Ctrl+C to stop.`);
  await tick();
  setInterval(() => {
    tick().catch((e) => console.error("[keep-alive] tick failed:", e));
  }, INTERVAL_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
