import { Server, Socket as SocketIOSocket } from 'socket.io';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { Socket as TcpSocket } from 'net';
import { resolve } from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import type { StrokeInput } from '~/game/physics';
import { getNextActivePlayer, getWinnerPlayerIds, makeMatchTracks, makePlayerRows, MAX_STROKES } from '~/game/session';
import { LobbyType, RoomResponse, RoomState, User } from '~/types';
import { log } from '~/utils/logger';
import { WS_PORT } from './env';
import { simulateJavaShot } from './javaShot';

export interface ServerToClientEvents {
  userJoined: (username: string) => void;
  userLeft: (username: string) => void;
  message: (text: string, from: string, isPrivate?: boolean) => void;
  users: (users: User[]) => void;
  roomState: (room: RoomState) => void;
  gameStarted: (room: RoomState) => void;
  strokeTaken: (stroke: StrokeInput) => void;
  turnChanged: (playerId: number) => void;
  trackStarted: (room: RoomState) => void;
  gameFinished: (room: RoomState) => void;
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
  turnComplete: (onHole: boolean) => void;
}

interface InterServerEvents {
  ping: () => void;
}

interface SocketData {
  name: string;
  lobbyType?: LobbyType;
  roomId?: string;
  playerId?: number;
}

const httpServer = createServer((request, response) => {
  void handleHttpRequest(request, response);
});

const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
  cors: {
    origin: '*',
  },
});

const classicTcpHost = process.env.CLASSIC_TCP_HOST || '127.0.0.1';
const classicTcpPort = Number(process.env.CLASSIC_TCP_PORT || 4242);
const classicWss = new WebSocketServer({ server: httpServer, path: '/classic-ws' });

classicWss.on('connection', (webSocket) => {
  const tcp = new TcpSocket();
  let readBuffer = '';
  let settled = false;

  const closeBoth = () => {
    if (!settled) {
      settled = true;
      tcp.destroy();
      webSocket.close();
    }
  };

  tcp.setEncoding('utf8');
  tcp.on('data', (chunk) => {
    readBuffer += chunk;
    const lines = readBuffer.split(/\r?\n/);
    readBuffer = lines.pop() || '';
    for (const line of lines) {
      if (webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(line);
      }
    }
  });
  tcp.on('error', closeBoth);
  tcp.on('close', closeBoth);

  webSocket.on('message', (message) => {
    if (tcp.writable) {
      tcp.write(`${message.toString()}\n`);
    }
  });
  webSocket.on('error', closeBoth);
  webSocket.on('close', closeBoth);

  tcp.connect(classicTcpPort, classicTcpHost);
});

function writeCorsHeaders(response: ServerResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

async function handleHttpRequest(request: IncomingMessage, response: ServerResponse) {
  if (request.url?.startsWith('/api/java-shot')) {
    writeCorsHeaders(response);

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method !== 'POST') {
      response.writeHead(405, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    try {
      const result = await simulateJavaShot(await readJsonBody(request));
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(result));
    } catch (error) {
      log.error('Java shot simulation failed', error);
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Java shot simulation failed' }));
    }
    return;
  }

  if (request.url?.startsWith('/socket.io/')) {
    return;
  }

  response.writeHead(404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ error: 'Not found' }));
}

function getConnectionsText() {
  const { clientsCount } = io.engine;
  return `(Connections: ${clientsCount})`;
}

const ignoredPlayersByUsername = new Map<string, Set<string>>();
const rooms = new Map<string, RoomState>();
const trackNames = new Set(
  JSON.parse(readFileSync(resolve(process.cwd(), 'public/assets/tracks/tracks.json'), 'utf8')) as string[],
);

function sanitizeUsername(username: string | undefined, fallback: string) {
  const trimmed = username?.trim().replace(/\s+/g, ' ').slice(0, 18);
  return trimmed || fallback;
}

function roomChannel(roomId: string) {
  return `room:${roomId}`;
}

type MinigolfSocket = SocketIOSocket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

function createRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return rooms.has(code) ? createRoomCode() : code;
}

function emitRoomState(room: RoomState) {
  io.to(roomChannel(room.id)).emit('roomState', room);
}

function createRoomState(roomId: string, hostId: string, hostName: string): RoomState {
  const trackList = makeMatchTracks().filter((trackName) => trackNames.has(trackName));
  const trackNamesForRoom = trackList.length > 0 ? trackList : ['BasicElements'];
  return {
    id: roomId,
    hostId,
    players: [
      {
        id: hostId,
        name: hostName,
        playerId: 0,
      },
    ],
    status: 'lobby',
    trackName: trackNamesForRoom[0],
    trackNames: trackNamesForRoom,
    trackIndex: 0,
    currentPlayerId: 0,
    currentStrokes: [0],
    scores: [[]],
    holed: [false],
    maxStrokes: MAX_STROKES,
    winnerPlayerIds: [],
  };
}

function syncRoomPlayerArrays(room: RoomState) {
  room.currentStrokes = room.players.map((_, playerId) => room.currentStrokes[playerId] ?? 0);
  room.scores = room.players.map((_, playerId) => room.scores[playerId] ?? []);
  room.holed = room.players.map((_, playerId) => room.holed[playerId] ?? false);
}

function resetRoomMatch(room: RoomState) {
  room.trackNames = makeMatchTracks().filter((trackName) => trackNames.has(trackName));
  if (room.trackNames.length === 0) {
    room.trackNames = ['BasicElements'];
  }
  room.trackIndex = 0;
  room.trackName = room.trackNames[0];
  room.currentPlayerId = 0;
  room.currentStrokes = makePlayerRows(room.players.length, 0);
  room.scores = room.players.map(() => []);
  room.holed = makePlayerRows(room.players.length, false);
  room.maxStrokes = MAX_STROKES;
  room.winnerPlayerIds = [];
}

function finishTrackOrAdvanceTurn(room: RoomState) {
  if (!room.holed.every(Boolean)) {
    room.currentPlayerId = getNextActivePlayer(room.currentPlayerId, room.holed);
    io.to(roomChannel(room.id)).emit('turnChanged', room.currentPlayerId);
    emitRoomState(room);
    return;
  }

  room.players.forEach((_, playerId) => {
    room.scores[playerId][room.trackIndex] = room.currentStrokes[playerId] || room.maxStrokes + 1;
  });

  room.trackIndex += 1;
  if (room.trackIndex >= room.trackNames.length) {
    room.status = 'finished';
    room.winnerPlayerIds = getWinnerPlayerIds(room.scores);
    io.to(roomChannel(room.id)).emit('gameFinished', room);
    emitRoomState(room);
    return;
  }

  room.trackName = room.trackNames[room.trackIndex];
  room.currentStrokes = makePlayerRows(room.players.length, 0);
  room.holed = makePlayerRows(room.players.length, false);
  room.currentPlayerId = room.trackIndex % room.players.length;
  io.to(roomChannel(room.id)).emit('trackStarted', room);
  emitRoomState(room);
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
  syncRoomPlayerArrays(room);

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
    const displayName = socket.data.name || username;
    if (privateMessageUser) {
      io.to(privateMessageUser).emit('message', text, displayName, true);
    } else if (socket.data.roomId) {
      socket.to(roomChannel(socket.data.roomId)).emit('message', text, displayName);
    } else {
      socket.broadcast.emit('message', text, displayName);
    }
  });

  socket.on('disconnect', () => {
    leaveCurrentRoom(socket);
    if (socket.data.lobbyType) {
      // Broadcast leave message to all users in the current lobby
      socket.broadcast.emit('userLeft', socket.data.name || username);
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
        name: s.data.name || 'Player',
      })),
    );
    // Broadcast join message to all users in the current lobby
    socket.to(lobbyType).emit('userJoined', socket.data.name || username);
  });

  socket.on('leaveLobby', () => {
    const lobbyType = socket.data.lobbyType;
    if (lobbyType) {
      log.info(`"${socket.data.name}" left "${lobbyType}" lobby`);
      socket.leave(lobbyType);
      socket.to(lobbyType).emit('userLeft', socket.data.name || username);
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
    const room = createRoomState(roomId, socket.id, socket.data.name);

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

    if (room.status !== 'lobby') {
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
    syncRoomPlayerArrays(room);
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

    if (room.players.length < 2) {
      callback({ ok: false, error: 'Need at least 2 players' });
      return;
    }

    room.status = 'playing';
    resetRoomMatch(room);
    callback({ ok: true, room });
    io.to(roomChannel(room.id)).emit('gameStarted', room);
    emitRoomState(room);
  });

  socket.on('takeStroke', (stroke) => {
    const room = socket.data.roomId ? rooms.get(socket.data.roomId) : undefined;
    if (!room || room.status !== 'playing' || socket.data.playerId !== room.currentPlayerId) {
      return;
    }

    room.currentStrokes[socket.data.playerId] = (room.currentStrokes[socket.data.playerId] ?? 0) + 1;
    socket.to(roomChannel(room.id)).emit('strokeTaken', {
      ...stroke,
      playerId: socket.data.playerId,
    });
    emitRoomState(room);
  });

  socket.on('turnComplete', (onHole) => {
    const room = socket.data.roomId ? rooms.get(socket.data.roomId) : undefined;
    if (!room || room.status !== 'playing' || socket.data.playerId !== room.currentPlayerId) {
      return;
    }

    const playerId = socket.data.playerId;
    room.holed[playerId] = onHole || room.currentStrokes[playerId] >= room.maxStrokes;
    finishTrackOrAdvanceTurn(room);
  });
});

// Close server before reload (Vite-node)
const { hot } = import.meta;

if (hot) {
  hot.on('vite:beforeFullReload', () => {
    io.close();
    httpServer.close();
  });
}

httpServer.listen(WS_PORT, () => {
  log.info(`Socket.IO server started on port ${WS_PORT}`);
});
