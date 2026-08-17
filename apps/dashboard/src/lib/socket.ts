import { io, type Socket } from "socket.io-client";
import { API_URL, getToken } from "./api";

let socket: Socket | null = null;

export function getSocket(orgId: string): Socket {
  if (!socket) {
    // The server verifies this token and binds the socket to its org; the orgId in the
    // `join` emit is advisory only (the server ignores it and uses the token's org).
    socket = io(API_URL, { transports: ["websocket"], withCredentials: true, auth: { token: getToken() ?? undefined } });
    socket.on("connect", () => socket?.emit("join", { orgId }));
  }
  return socket;
}

/** Drop the shared socket so the next getSocket() reconnects with a fresh token. */
export function resetSocket() {
  socket?.disconnect();
  socket = null;
}
