import { Server, Socket } from 'socket.io';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { StrokeInput } from '~/game/physics';
import { LobbyType, RoomResponse, RoomState, User } from '~/types';
import { log } from '~/utils/logger';
import { WS_PORT } from './env';

export interface ServerToClientEvents {
  userJoined: (username: string) => void;
  userLeft: (username: string) => void;
  message: (text: string, from: string, isPrivate?: boolean) => void;
  users: (users: User[]) => void;
  roomState: (room: RoomState) => void;
  gameStarted: (room: RoomState) => void;
  strokeTaken: (stroke: StrokeInput) => void;
  turnChanged: (playerId: number) => void;
}

export interface ClientToServerEvents {
  setUsername: (username: string) => void;
  setPrivateMessageUser: (username: string | undefined) => void;
  joinLobby: (gameMode: LobbyType) => void;
  leaveLobby: () => void;
  sendMessage: (text: string) => void;
  createRoom: (username: string, callback: (response: RoomResponse) => void) => void;
  joinRoom: (roomId: string, username: string, callback: (response: RoomResponse) => void) => void;
  leaveRoom: () => void;
  startRoomGame: (callback: (response: RoomResponse) => void) => void;
  takeStroke: (stroke: StrokeInput) => void;
  turnComplete: () => void;
}

interface InterServerEvents {
  ping: () => void;
}

interface SocketData {
  name: string;
  lobbyType: LobbyType;
  roomId?: string;
  playerId?: number;
}

const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(WS_PORT, {
  cors: {
    origin: '*',
  },
});

function getConnectionsText() {
  const { clientsCount } = io.engine;
  return `(Connections: ${clientsCount})`;
}

const ignoredPlayersByUsername = new Map<string, Set<string>>();
const rooms = new Map<string, RoomState>();
const trackNames = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/assets/tracks/tracks.json'), 'utf8'),
) as string[];

function sanitizeUsername(username: string | undefined, fallback: string) {
  const trimmed = username?.trim().replace(/\s+/g, ' ').slice(0, 18);
  return trimmed || fallback;
}

function roomChannel(roomId: string) {
  return `room:${roomId}`;
}

type MinigolfSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

function createRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return rooms.has(code) ? createRoomCode() : code;
}

function pickTrackName() {
  const curated = ['Aquaria', 'BasicElements', 'BasementReflex', 'ColourMeYellow', 'Cube', 'Darwin', 'WildWest'];
  const candidates = curated.filter((trackName) => trackNames.includes(trackName));
  const list = candidates.length > 0 ? candidates : trackNames;
  return list[Math.floor(Math.random() * list.length)];
}

function emitRoomState(room: RoomState) {
  io.to(roomChannel(room.id)).emit('roomState', room);
}

function leaveCurrentRoom(socket: MinigolfSocket) {
  const roomId = socket.data.roomId;
  if (!roomId) {
    return;
  }

  const room = rooms.get(roomId);
  socket.leave(roomChannel(roomId));
  socket.data.roomId = undefined;
  socket.data.playerId = undefined;

  if (!room) {
    return;
  }

  room.players = room.players.filter((player) => player.id !== socket.id);
  if (room.players.length === 0) {
    rooms.delete(roomId);
    return;
  }

  if (room.hostId === socket.id) {
    room.hostId = room.players[0].id;
  }

  room.players = room.players.map((player, playerId) => ({
    ...player,
    playerId,
  }));

  if (room.currentPlayerId >= room.players.length) {
    room.currentPlayerId = 0;
  }

  emitRoomState(room);
}

io.on('connection', (socket) => {
  const username = `User-${socket.id.substring(0, 3)}`;
  let privateMessageUser: string | undefined;

  log.info(`"${username}" connected. ${getConnectionsText()}`);
  socket.data.name = username;
  socket.join(username);

  socket.on('setUsername', (name) => {
    socket.data.name = sanitizeUsername(name, username);
  });

  socket.on('sendMessage', (text) => {
    if (privateMessageUser) {
      io.to(privateMessageUser).emit('message', text, username, true);
    } else {
      socket.broadcast.emit('message', text, username);
    }
  });

  socket.on('disconnect', () => {
    leaveCurrentRoom(socket);
    if (socket.data.lobbyType) {
      // Broadcast leave message to all users in the current lobby
      socket.broadcast.emit('userLeft', username);
    }
    log.info(`"${username}" disconnected. ${getConnectionsText()}`);
  });

  socket.on('joinLobby', async (lobbyType) => {
    log.info(`"${socket.data.name}" joined "${lobbyType}" lobby`);
    socket.data.lobbyType = lobbyType;
    await socket.join(lobbyType);
    const roomSockets = await io.in(lobbyType).fetchSockets();
    socket.emit(
      'users',
      roomSockets.map((s) => ({
        name: s.data.name,
      })),
    );
    // Broadcast join message to all users in the current lobby
    socket.to(lobbyType).emit('userJoined', username);
  });

  socket.on('leaveLobby', () => {
    if (socket.data.lobbyType) {
      log.info(`"${socket.data.name}" left "${socket.data.lobbyType}" lobby`);
      socket.leave(socket.data.lobbyType);
      socket.to(socket.data.lobbyType).emit('userLeft', username);
      socket.data.lobbyType = undefined;
    }
  });

  socket.on('setPrivateMessageUser', (username) => {
    privateMessageUser = username;
  });

  socket.on('createRoom', async (name, callback) => {
    leaveCurrentRoom(socket);
    socket.data.name = sanitizeUsername(name, username);
    const roomId = createRoomCode();
    const room: RoomState = {
      id: roomId,
      hostId: socket.id,
      players: [
        {
          id: socket.id,
          name: socket.data.name,
          playerId: 0,
        },
      ],
      status: 'lobby',
      trackName: pickTrackName(),
      currentPlayerId: 0,
    };

    rooms.set(roomId, room);
    socket.data.roomId = roomId;
    socket.data.playerId = 0;
    await socket.join(roomChannel(roomId));
    callback({ ok: true, room });
    emitRoomState(room);
  });

  socket.on('joinRoom', async (roomIdInput, name, callback) => {
    const roomId = roomIdInput.trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room) {
      callback({ ok: false, error: 'Room not found' });
      return;
    }

    if (room.status === 'playing') {
      callback({ ok: false, error: 'Game already started' });
      return;
    }

    if (room.players.length >= 4) {
      callback({ ok: false, error: 'Room is full' });
      return;
    }

    leaveCurrentRoom(socket);
    socket.data.name = sanitizeUsername(name, username);
    socket.data.roomId = roomId;
    socket.data.playerId = room.players.length;
    room.players.push({
      id: socket.id,
      name: socket.data.name,
      playerId: socket.data.playerId,
    });
    await socket.join(roomChannel(roomId));
    callback({ ok: true, room });
    emitRoomState(room);
  });

  socket.on('leaveRoom', () => {
    leaveCurrentRoom(socket);
  });

  socket.on('startRoomGame', (callback) => {
    const room = socket.data.roomId ? rooms.get(socket.data.roomId) : undefined;
    if (!room) {
      callback({ ok: false, error: 'Join or create a room first' });
      return;
    }

    if (room.hostId !== socket.id) {
      callback({ ok: false, error: 'Only the host can start' });
      return;
    }

    room.status = 'playing';
    room.trackName = pickTrackName();
    room.currentPlayerId = 0;
    callback({ ok: true, room });
    io.to(roomChannel(room.id)).emit('gameStarted', room);
    emitRoomState(room);
  });

  socket.on('takeStroke', (stroke) => {
    const room = socket.data.roomId ? rooms.get(socket.data.roomId) : undefined;
    if (!room || room.status !== 'playing' || socket.data.playerId !== room.currentPlayerId) {
      return;
    }

    io.to(roomChannel(room.id)).emit('strokeTaken', {
      ...stroke,
      playerId: socket.data.playerId,
    });
  });

  socket.on('turnComplete', () => {
    const room = socket.data.roomId ? rooms.get(socket.data.roomId) : undefined;
    if (!room || room.status !== 'playing') {
      return;
    }

    room.currentPlayerId = (room.currentPlayerId + 1) % room.players.length;
    io.to(roomChannel(room.id)).emit('turnChanged', room.currentPlayerId);
    emitRoomState(room);
  });
});

// Close server before reload (Vite-node)
const { hot } = import.meta;

if (hot) {
  hot.on('vite:beforeFullReload', () => {
    io.close();
  });
}

log.info(`Socket.IO server started on port ${WS_PORT}`);
