import { useCallback, useEffect, useRef, useState } from "react";
import { RT_EVENTS, type LiveFramePayload, type LiveMonitorsPayload } from "@eagle/shared";
import { getSocket } from "./socket";

export interface LiveFrame {
  data: string;
  ts: number;
}
export interface LiveState {
  frames: Record<string, LiveFrame>;
  monitors: Record<string, number>; // employeeId -> monitor count
  setMonitor: (employeeId: string, index: number) => void;
}

/**
 * Subscribes to live screen frames for a set of employees and returns the latest
 * frame per employee, each employee's monitor count, and a monitor switcher.
 * Watches/unwatches as the id set changes; stops everything on unmount.
 */
export function useLiveFrames(orgId: string | undefined, employeeIds: string[]): LiveState {
  const [frames, setFrames] = useState<Record<string, LiveFrame>>({});
  const [monitors, setMonitors] = useState<Record<string, number>>({});
  const watched = useRef<Set<string>>(new Set());
  const key = employeeIds.slice().sort().join(",");

  const setMonitor = useCallback((employeeId: string, index: number) => {
    if (!orgId) return;
    getSocket(orgId).emit(RT_EVENTS.liveSetMonitor, { employeeId, index });
  }, [orgId]);

  // Receive frames + monitor counts.
  useEffect(() => {
    if (!orgId) return;
    const socket = getSocket(orgId);
    const onFrame = (p: LiveFramePayload) =>
      setFrames((f) => ({ ...f, [p.employeeId]: { data: p.data, ts: p.ts } }));
    const onEnded = (p: { employeeId: string }) =>
      setFrames((f) => {
        const c = { ...f };
        delete c[p.employeeId];
        return c;
      });
    const onMonitors = (p: LiveMonitorsPayload) =>
      setMonitors((m) => ({ ...m, [p.employeeId]: p.count }));
    socket.on(RT_EVENTS.liveFrame, onFrame);
    socket.on(RT_EVENTS.liveEnded, onEnded);
    socket.on(RT_EVENTS.liveMonitors, onMonitors);
    return () => {
      socket.off(RT_EVENTS.liveFrame, onFrame);
      socket.off(RT_EVENTS.liveEnded, onEnded);
      socket.off(RT_EVENTS.liveMonitors, onMonitors);
    };
  }, [orgId]);

  // Reconcile subscriptions.
  useEffect(() => {
    if (!orgId) return;
    const socket = getSocket(orgId);
    const next = new Set(employeeIds);
    for (const id of next) {
      if (!watched.current.has(id)) {
        socket.emit(RT_EVENTS.liveWatch, { employeeId: id, on: true });
        watched.current.add(id);
      }
    }
    for (const id of Array.from(watched.current)) {
      if (!next.has(id)) {
        socket.emit(RT_EVENTS.liveWatch, { employeeId: id, on: false });
        watched.current.delete(id);
        setFrames((f) => {
          const c = { ...f };
          delete c[id];
          return c;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, key]);

  // Stop all on unmount.
  useEffect(() => {
    return () => {
      if (!orgId) return;
      const socket = getSocket(orgId);
      for (const id of watched.current) socket.emit(RT_EVENTS.liveWatch, { employeeId: id, on: false });
      watched.current.clear();
    };
  }, [orgId]);

  return { frames, monitors, setMonitor };
}
