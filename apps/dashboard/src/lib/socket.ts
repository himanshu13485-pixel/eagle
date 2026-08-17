import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api";

let socket: Socket | null = null;

export function getSocket(orgId: string): Socket {
  if (!socket) {
    socket = io(API_URL, { transports: ["websocket"], withCredentials: true });
    socket.on("connect", () => socket?.emit("join", { orgId }));
  }
  return socket;
}
