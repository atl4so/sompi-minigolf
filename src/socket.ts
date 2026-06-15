import { Socket, io } from 'socket.io-client';
import { ClientToServerEvents, ServerToClientEvents } from './server';

const explicitSocketUrl = import.meta.env.VITE_WS_URL;
const socketUrl = explicitSocketUrl
  ? explicitSocketUrl
  : import.meta.env.VITE_WS_HOST
  ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${import.meta.env.VITE_WS_HOST}:${
      import.meta.env.VITE_WS_PORT || 8081
    }`
  : undefined;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = socketUrl ? io(socketUrl) : io();

/**
 * @todo Temporary until user can properly set this.
 */
export function getCurrentUsername() {
  return `User-${socket.id?.substring(0, 3) || 'new'}`;
}
