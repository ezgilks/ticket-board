import { io, type Socket } from "socket.io-client";
import { tokenStore } from "./token";

// One socket per browser tab, created lazily. In dev, "/" goes through the Vite proxy;
// in production VITE_SOCKET_URL points at the API host.
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL ?? "/", {
      // A function, so a fresh token is read on every (re)connect.
      auth: (cb) => cb({ token: tokenStore.get() }),
      transports: ["websocket"],
    });
  }
  return socket;
}

export function currentSocketId(): string | undefined {
  return socket?.connected ? socket.id : undefined;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
