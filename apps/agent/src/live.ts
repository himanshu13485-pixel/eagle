import { io, type Socket } from "socket.io-client";
import { captureLive, getMonitorCount } from "./capture";

const LIVE_FPS_MS = 700; // ~1.4 fps — tune down for WAN; WebRTC upgrade planned
const LIVE_MAX_WIDTH = 1600; // downscale live frames so 4K / multi-monitor stream cheaply
const LIVE_QUALITY = 55;

/**
 * Opens an authenticated socket to the API and streams JPEG frames on demand.
 * Only captures while the server says a viewer is watching (`live.start`/`live.stop`),
 * so idle agents cost nothing. Streams one monitor at a time (downscaled); the viewer
 * can switch monitors via `live.monitor`.
 */
export function connectLive(
  serverUrl: string,
  deviceToken: string,
  employeeId: string,
  onCaptureNow?: () => void,
): Socket {
  const socket = io(serverUrl, {
    auth: { deviceToken },
    transports: ["websocket"],
    reconnection: true,
  });

  let timer: NodeJS.Timeout | null = null;
  let busy = false;
  let monitor = 0; // 0 = primary; viewer can switch

  const announceMonitors = () => {
    getMonitorCount()
      .then((count) => socket.emit("live.monitors", { employeeId, count }))
      .catch(() => {});
  };

  const start = () => {
    if (timer) return;
    console.log("[live] viewer attached — streaming");
    announceMonitors();
    timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const img = await captureLive(monitor, LIVE_MAX_WIDTH, LIVE_QUALITY);
        socket.emit("live.frame", {
          employeeId,
          ts: Date.now(),
          data: `data:image/jpeg;base64,${img.toString("base64")}`,
        });
      } catch (e: any) {
        console.error("[live]", e.message);
      } finally {
        busy = false;
      }
    }, LIVE_FPS_MS);
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      console.log("[live] viewers gone — stopped");
    }
  };

  socket.on("connect", () => console.log("[live] socket connected"));
  socket.on("live.start", start);
  socket.on("live.stop", stop);
  socket.on("capture.now", () => onCaptureNow?.());
  socket.on("live.monitor", (p: { index?: number }) => {
    if (typeof p?.index === "number" && p.index >= 0) {
      monitor = p.index;
      console.log(`[live] switched to monitor ${monitor}`);
    }
  });
  socket.on("disconnect", stop);

  return socket;
}
