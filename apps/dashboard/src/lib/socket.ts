import { io, type Socket } from "socket.io-client";
import { API_URL, getToken } from "./api";

let socket: Socket | null = null;

export function getSocket(orgId: string): Socket {
  if (!socket) {
    // The server verifies this token and binds the socket to its org; the orgId in the
    // `join` emit is advisory only (the server ignores it and uses the token's org).
    //
    // auth is a function, not a value: read once, the socket kept whichever
    // access token existed at first connect, so after a refresh rotated it
    // every reconnect re-authenticated with a stale token for the rest of the
    // session. A function is re-evaluated on each (re)connection attempt.
    socket = io(API_URL, {
      transports: ["websocket"],
      withCredentials: true,
      auth: (cb) => cb({ token: getToken() ?? undefined }),
    });
    socket.on("connect", () => socket?.emit("join", { orgId }));
  }
  return socket;
}

/** Drop the shared socket so the next getSocket() reconnects with a fresh token. */
export function resetSocket() {
  socket?.disconnect();
  socket = null;
}
