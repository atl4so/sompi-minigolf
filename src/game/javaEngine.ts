import type { StrokeInput } from './physics';

const GAME_WIDTH = 735;
const GAME_HEIGHT = 375;
const MAP_WIDTH = 49;
const MAP_HEIGHT = 25;

export interface JavaShotResult {
  frames: number[][];
  playerX: number[];
  playerY: number[];
  speedX: number[];
  speedY: number[];
  onHole: boolean[];
  seedRaw: number;
  mapTiles: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function int16ArrayToBase64(values: Int16Array | null): string {
  if (!values) {
    return '';
  }

  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i++) {
    view.setInt16(i * 2, values[i], false);
  }
  return bytesToBase64(bytes);
}

function mapTilesToBase64(): string {
  if (!game.currentMap) {
    return '';
  }

  const bytes = new Uint8Array(MAP_WIDTH * MAP_HEIGHT * 4);
  const view = new DataView(bytes.buffer);
  let offset = 0;

  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      view.setInt32(offset, game.currentMap.tiles[x][y].tileCode, false);
      offset += 4;
    }
  }

  return bytesToBase64(bytes);
}

function serializeNumberArray(values: number[]): string {
  return values.join(',');
}

function serializeBooleanArray(values: boolean[]): string {
  return values.map((value) => (value ? '1' : '0')).join(',');
}

function serializeTeleports(groups: number[][][]): string {
  return groups.map((group) => group.map(([x, y]) => `${x}:${y}`).join(';')).join('|');
}

function buildRequest(stroke: StrokeInput): Record<string, string> | null {
  if (!game.currentMap || !game.collisionMap) {
    return null;
  }

  return {
    playerCount: String(game.playerCount),
    currentPlayerId: String(game.currentPlayerId),
    playerId: String(stroke.playerId),
    waterMode: String(game.waterMode),
    collisionMode: String(game.collisionMode),
    startPositionX: String(game.startPositionX),
    startPositionY: String(game.startPositionY),
    resetPositionX: serializeNumberArray(game.resetPositionX),
    resetPositionY: serializeNumberArray(game.resetPositionY),
    teleportStarts: serializeTeleports(game.teleportStarts),
    teleportExits: serializeTeleports(game.teleportExits),
    magnetMap: int16ArrayToBase64(game.magnetMap),
    playerX: serializeNumberArray(game.playerX),
    playerY: serializeNumberArray(game.playerY),
    speedX: serializeNumberArray(game.speedX),
    speedY: serializeNumberArray(game.speedY),
    simulatePlayer: Array.from({ length: game.playerCount }, () => '1').join(','),
    onHoleSync: serializeBooleanArray(game.onHoleSync),
    playerActive: Array.from({ length: game.playerCount }, () => '1').join(','),
    isLocalPlayer: '1',
    seedRaw: String(game.seed.getRaw()),
    maxPhysicsIterations: '2',
    mouseX: String(stroke.mouseX),
    mouseY: String(stroke.mouseY),
    shootingMode: String(stroke.shootingMode),
    collisionMap: bytesToBase64(game.collisionMap),
    mapTiles: mapTilesToBase64(),
  };
}

function getEngineEndpoint(): string {
  const base = import.meta.env.VITE_ENGINE_URL || import.meta.env.VITE_WS_URL || window.location.origin;
  return new URL('/api/java-shot', base).toString();
}

export async function simulateJavaShot(stroke: StrokeInput): Promise<JavaShotResult | null> {
  const request = buildRequest(stroke);
  if (!request) {
    return null;
  }

  const response = await fetch(getEngineEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as JavaShotResult;
}
