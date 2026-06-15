export type LobbyType = 'single' | 'dual' | 'multi';

export interface User {
  name: string;
}

export interface RoomPlayer extends User {
  id: string;
  playerId: number;
}

export interface RoomState {
  id: string;
  hostId: string;
  players: RoomPlayer[];
  status: 'lobby' | 'playing';
  trackName: string;
  currentPlayerId: number;
}

export interface RoomResponse {
  ok: boolean;
  room?: RoomState;
  error?: string;
}
