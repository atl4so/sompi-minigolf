import { rgbToLong } from '~/utils/color';
import { log } from '~/utils/logger';
import { GAME_HEIGHT, GAME_WIDTH, HALF_BALL, HALF_TILE, TILE_SIZE } from './constants';
import { drawDashedLine, drawLine } from './draw';
import type { JavaShotResult } from './javaEngine';
import { MinigolfMap } from './minigolfMap';
import { getPlayerPos, getStrokePower, resetPlayerPosition, setPlayerPosRel, setPlayerSpeed, setPlayerX, setPlayerY } from './physics';
import { getPixelMask, spriteManager } from './spriteManager';
import { createTile, Tile } from './tile';

interface MapRenderResult {
  startPositions: number[][];
}

interface MapState {
  startPositionX: number;
  startPositionY: number;
  resetPositionX: number[];
  resetPositionY: number[];
  teleportStarts: number[][][];
  teleportExits: number[][][];
  magnetMap: Int16Array | null;
}

const MAGIC_OFFSET = Math.sqrt(2) / 2;
const DIAG_OFFSET = Math.floor(6 * MAGIC_OFFSET + 0.5);
const MAGNET_GRID_WIDTH = GAME_WIDTH / 5;
const MAGNET_GRID_HEIGHT = GAME_HEIGHT / 5;
const PHYSICS_ITERATIONS_PER_FRAME = 2;
const PHYSICS_SUBSTEPS = 10;
const HOLE_DONE_TIMER = 2.1666666666666665;
const LIQUID_DONE_TIMER = 6;

function getCollisionMapIndex(x: number, y: number): number {
  return Math.floor(y) * GAME_WIDTH + Math.floor(x);
}

function getCollisionAt(x: number, y: number): number {
  const clampedX = Math.max(0, Math.min(GAME_WIDTH - 1, Math.floor(x)));
  const clampedY = Math.max(0, Math.min(GAME_HEIGHT - 1, Math.floor(y)));
  return game.collisionMap?.[getCollisionMapIndex(clampedX, clampedY)] ?? 0;
}

function getTileSpecial(tile: Tile): number {
  return Math.floor(tile.tileCode / 16777216);
}

function getSpecialShape(tile: Tile): number {
  return tile.shape + 24;
}

function getJavaBackground(tile: Tile): number {
  return tile.foreground;
}

function getJavaForeground(tile: Tile): number {
  return tile.background;
}

function createTileFromCode(tileCode: number): Tile {
  const special = Math.floor(tileCode / 16777216);
  const shape = Math.floor(tileCode / 65536) % 256;
  const javaBackground = Math.floor(tileCode / 256) % 256;
  const javaForeground = Math.floor(tileCode) % 256;
  return createTile(shape, javaBackground, javaForeground, special);
}

function makeTileCode(special: number, javaShape: number, javaBackground: number, javaForeground = 0): number {
  return special * 256 * 256 * 256 + (javaShape - 24) * 256 * 256 + javaBackground * 256 + javaForeground;
}

function updateTile(tileX: number, tileY: number, tileCode: number): void {
  if (!game.currentMap || tileX < 0 || tileX >= game.currentMap.width || tileY < 0 || tileY >= game.currentMap.height) {
    return;
  }

  game.currentMap.tiles[tileX][tileY] = createTileFromCode(tileCode);
}

function redrawCurrentMap(): void {
  if (game.currentMap) {
    renderMap(game.currentMap);
  }
}

function isLiquidTile(tileId: number): boolean {
  return tileId === 12 || tileId === 13 || tileId === 14 || tileId === 15;
}

function isWallCollisionTile(tileId: number): boolean {
  return (
    (tileId >= 16 && tileId <= 23 && tileId !== 19) || tileId === 27 || (tileId >= 40 && tileId <= 43) || tileId === 46
  );
}

function calculateFriction(tileId: number, speed: number): number {
  const friction = getBaseFriction(tileId);
  const speedModifier = (0.75 * speed) / 6.5;
  return friction + (1 - friction) * speedModifier;
}

function getBaseFriction(tileId: number): number {
  if (tileId === 0 || (tileId >= 4 && tileId <= 11) || tileId === 19 || tileId === 47) {
    return 0.9935;
  }

  if (tileId === 1) {
    return 0.92;
  }

  if (tileId === 2) {
    return 0.8;
  }

  if (tileId === 3 || tileId === 32 || tileId === 34 || tileId === 36 || tileId === 38) {
    return 0.9975;
  }

  if (tileId === 12 || tileId === 13) {
    return 0;
  }

  if (tileId === 14 || tileId === 15) {
    return 0.95;
  }

  if (tileId >= 20 && tileId <= 23) {
    return 0.995;
  }

  if (tileId === 25) {
    return 0.96;
  }

  if (tileId === 29 || tileId === 31 || tileId === 44) {
    return 0.9;
  }

  return 1;
}

function getSpeedEffect(tileId: number, playerId: number, x: number, y: number, offsetX: number, offsetY: number): number {
  if (tileId === 16) {
    return 0.81;
  }

  if (tileId === 17) {
    return 0.05;
  }

  if (tileId === 18) {
    if (game.bounciness <= 0) {
      return 0.84;
    }

    game.bounciness -= 0.01;
    const speed = Math.hypot(game.speedX[playerId], game.speedY[playerId]);
    return speed === 0 ? 0.84 : (game.bounciness * 6.5) / speed;
  }

  if (tileId >= 20 && tileId <= 23) {
    return 0.82;
  }

  if (tileId === 27 || tileId === 46) {
    return handleMovableBlock(x, y, offsetX, offsetY, tileId === 27) ? 0.325 : 0.8;
  }

  if (tileId >= 40 && tileId <= 43) {
    handleBreakableBlock(x, y);
    return 0.9;
  }

  return 1;
}

function buildCollisionMap(map: MinigolfMap): Uint8Array {
  const collisionMap = new Uint8Array(GAME_WIDTH * GAME_HEIGHT);

  for (let tileY = 0; tileY < map.height; tileY++) {
    for (let tileX = 0; tileX < map.width; tileX++) {
      const tile = map.tiles[tileX][tileY];
      const special = Math.floor(tile.tileCode / 16777216);
      const shape = tile.shape;
      const mask = getPixelMask(special, shape);

      if (!mask) {
        continue;
      }

      for (let pixelY = 0; pixelY < TILE_SIZE; pixelY++) {
        for (let pixelX = 0; pixelX < TILE_SIZE; pixelX++) {
          let pixel: number;

          if (special === 1) {
            pixel = mask[pixelX][pixelY] === 1 ? tile.foreground : tile.background;
          } else {
            const specialShape = shape + 24;
            pixel = mask[pixelX][pixelY] === 1 ? tile.foreground : specialShape;

            if (
              specialShape === 24 ||
              specialShape === 26 ||
              specialShape === 33 ||
              specialShape === 35 ||
              specialShape === 37 ||
              specialShape === 39
            ) {
              pixel = tile.foreground;
            }

            if (specialShape === 44 && [12, 13, 14, 15].includes(tile.foreground)) {
              pixel = tile.foreground;
            }

            if (specialShape === 45) {
              pixel = tile.foreground;
            }
          }

          const x = tileX * TILE_SIZE + pixelX;
          const y = tileY * TILE_SIZE + pixelY;
          collisionMap[getCollisionMapIndex(x, y)] = pixel;
        }
      }
    }
  }

  return collisionMap;
}

function getMagnetMapIndex(gridX: number, gridY: number): number {
  return (gridY * MAGNET_GRID_WIDTH + gridX) * 2;
}

function buildMagnetMap(magnets: number[][]): Int16Array | null {
  if (magnets.length === 0) {
    return null;
  }

  const magnetMap = new Int16Array(MAGNET_GRID_WIDTH * MAGNET_GRID_HEIGHT * 2);

  for (let magnetLoopY = 2; magnetLoopY < GAME_HEIGHT; magnetLoopY += 5) {
    for (let magnetLoopX = 2; magnetLoopX < GAME_WIDTH; magnetLoopX += 5) {
      let forceTempX = 0;
      let forceTempY = 0;

      for (const [magnetX, magnetY, magnetShape] of magnets) {
        let forceTemp2X = magnetX - magnetLoopX;
        let forceTemp2Y = magnetY - magnetLoopY;
        let force = Math.sqrt(forceTemp2X * forceTemp2X + forceTemp2Y * forceTemp2Y);

        if (force > 0 && force <= 127) {
          const modifier = Math.abs(forceTemp2X) / force;
          force = 127 - force;
          forceTemp2X = (forceTemp2X < 0 ? -1 : 1) * force * modifier;
          forceTemp2Y = (forceTemp2Y < 0 ? -1 : 1) * force * (1 - modifier);

          if (magnetShape === 45) {
            forceTemp2X = -forceTemp2X;
            forceTemp2Y = -forceTemp2Y;
          }

          forceTempX += forceTemp2X;
          forceTempY += forceTemp2Y;
        }
      }

      const index = getMagnetMapIndex(Math.floor(magnetLoopX / 5), Math.floor(magnetLoopY / 5));
      magnetMap[index] = Math.max(-0x7ff, Math.min(0x7ff, Math.trunc(forceTempX)));
      magnetMap[index + 1] = Math.max(-0x7ff, Math.min(0x7ff, Math.trunc(forceTempY)));
    }
  }

  return magnetMap;
}

export function initializeMapState(map: MinigolfMap, gameId: number): MapState {
  const startPositions: number[][] = [];
  const resetPositionX = [-1, -1, -1, -1];
  const resetPositionY = [-1, -1, -1, -1];
  const teleportStarts: number[][][] = [[], [], [], []];
  const teleportExits: number[][][] = [[], [], [], []];
  const magnets: number[][] = [];

  for (let tileY = 0; tileY < map.height; tileY++) {
    for (let tileX = 0; tileX < map.width; tileX++) {
      const tile = map.tiles[tileX][tileY];
      if (getTileSpecial(tile) !== 2) {
        continue;
      }

      const shape = getSpecialShape(tile);
      const screenX = tileX * TILE_SIZE + HALF_TILE;
      const screenY = tileY * TILE_SIZE + HALF_TILE;

      if (shape === 24) {
        startPositions.push([screenX, screenY]);
      }

      if (shape >= 48 && shape <= 51) {
        resetPositionX[shape - 48] = screenX;
        resetPositionY[shape - 48] = screenY;
      }

      if (shape === 33 || shape === 35 || shape === 37 || shape === 39) {
        teleportExits[(shape - 33) / 2].push([screenX, screenY]);
      }

      if (shape === 32 || shape === 34 || shape === 36 || shape === 38) {
        teleportStarts[(shape - 32) / 2].push([screenX, screenY]);
      }

      if (shape === 44 || shape === 45) {
        magnets.push([Math.trunc(screenX + 0.5), Math.trunc(screenY + 0.5), shape]);
      }
    }
  }

  const startPosition = startPositions[gameId % startPositions.length] ?? [-1, -1];

  return {
    startPositionX: startPosition[0],
    startPositionY: startPosition[1],
    resetPositionX,
    resetPositionY,
    teleportStarts,
    teleportExits,
    magnetMap: buildMagnetMap(magnets),
  };
}

export function renderMap(map: MinigolfMap): MapRenderResult {
  const startPositions: number[][] = [];
  game.ctx.clearRect(0, 0, map.width * 15, map.height * 15);

  for (let tileY = 0; tileY < map.height; tileY++) {
    for (let tileX = 0; tileX < map.width; tileX++) {
      const tile = map.tiles[tileX][tileY];
      const { background, foreground, shape, isSpecial } = tile;

      const drawAtX = tileX * TILE_SIZE;
      const drawAtY = tileY * TILE_SIZE;

      if (isSpecial || shape === 0) {
        spriteManager.elements[background].draw(game.ctx, drawAtX, drawAtY);
        spriteManager.elements[foreground].draw(game.ctx, drawAtX, drawAtY);

        if (isSpecial && shape !== 4 && shape !== 6) {
          // 4 and 6 are mines
          const foregroundPixels = game.ctx.getImageData(drawAtX, drawAtY, 15, 15).data;

          if (shape === 0 || (shape >= 24 && shape <= 27)) {
            // Is starting position
            startPositions.push([drawAtX + HALF_TILE, drawAtY + HALF_TILE]);
            continue;
            // const playerId = shape === 0 ? 0 : shape - 24;
          } else {
            // Draw specials (Holes, teleports...)
            spriteManager.special[shape].draw(game.ctx, drawAtX, drawAtY);
          }

          const tileImageData = game.ctx.getImageData(drawAtX, drawAtY, 15, 15);
          const tilePixels = tileImageData.data;
          for (let i = 0; i < tilePixels.length; i += 4) {
            if (rgbToLong(tilePixels[i], tilePixels[i + 1], tilePixels[i + 2]) == 0xccccff || tilePixels[i + 3] == 0) {
              tileImageData.data[i] = foregroundPixels[i];
              tileImageData.data[i + 1] = foregroundPixels[i + 1];
              tileImageData.data[i + 2] = foregroundPixels[i + 2];
              tileImageData.data[i + 3] = foregroundPixels[i + 3];
            }
          }

          game.ctx.putImageData(tileImageData, drawAtX, drawAtY);
        }
      } else if (!isSpecial && shape > 0) {
        const sw = spriteManager.shapes[shape].width;
        const sh = spriteManager.shapes[shape].height;

        spriteManager.elements[background].draw(game.ctx, drawAtX, drawAtY);
        const pixelsBg = game.ctx.getImageData(drawAtX, drawAtY, sw, sh).data;

        spriteManager.elements[foreground].draw(game.ctx, drawAtX, drawAtY);
        const pixelsFg = game.ctx.getImageData(drawAtX, drawAtY, sw, sh).data;

        spriteManager.shapes[shape].draw(game.ctx, drawAtX, drawAtY);

        const tileImageData = game.ctx.getImageData(drawAtX, drawAtY, sw, sh);
        const tilePixels = tileImageData.data;

        for (let i = 0; i < tilePixels.length; i += 4) {
          const colour = rgbToLong(tilePixels[i], tilePixels[i + 1], tilePixels[i + 2]);
          if (colour == 0xccccff) {
            tileImageData.data[i] = pixelsFg[i];
            tileImageData.data[i + 1] = pixelsFg[i + 1];
            tileImageData.data[i + 2] = pixelsFg[i + 2];
            tileImageData.data[i + 3] = pixelsFg[i + 3];
          } else if (colour == 0) {
            tileImageData.data[i] = pixelsBg[i];
            tileImageData.data[i + 1] = pixelsBg[i + 1];
            tileImageData.data[i + 2] = pixelsBg[i + 2];
            tileImageData.data[i + 3] = pixelsBg[i + 3];
          }
        }
        game.ctx.putImageData(tileImageData, drawAtX, drawAtY);
      }
    }
  }

  game.collisionMap = buildCollisionMap(map);

  return {
    startPositions,
  };
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function applyJavaMapTiles(encodedMapTiles: string): void {
  if (!game.currentMap || !encodedMapTiles) {
    return;
  }

  const bytes = base64ToBytes(encodedMapTiles);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  for (let tileY = 0; tileY < game.currentMap.height; tileY++) {
    for (let tileX = 0; tileX < game.currentMap.width; tileX++) {
      game.currentMap.tiles[tileX][tileY] = createTileFromCode(view.getInt32(offset, false));
      offset += 4;
    }
  }
}

export const tileToDrawPosition = (tileX: number, tileY: number) =>
  [Math.floor(tileX * TILE_SIZE), Math.floor(tileY * TILE_SIZE)] as const;

export const drawBall = (playerId: number): void => {
  if (game.onHoleSync[playerId]) {
    return;
  }

  const [playerDrawX, playerDrawY] = getPlayerPos(playerId);
  const drawX = Math.floor(playerDrawX - HALF_BALL + 0.5);
  const drawY = Math.floor(playerDrawY - HALF_BALL + 0.5);
  const foregroundPixels = game.cursorCtx.getImageData(drawX, drawY, 15, 15).data;
  spriteManager.balls[playerId].draw(game.cursorCtx, drawX + 1, drawY + 1);

  const tileImageData = game.cursorCtx.getImageData(drawX, drawY, 15, 15);
  const tilePixels = tileImageData.data;
  for (let i = 0; i < tilePixels.length; i += 4) {
    if (rgbToLong(tilePixels[i], tilePixels[i + 1], tilePixels[i + 2]) == 0xccccff || tilePixels[i + 3] == 0) {
      tileImageData.data[i] = foregroundPixels[i];
      tileImageData.data[i + 1] = foregroundPixels[i + 1];
      tileImageData.data[i + 2] = foregroundPixels[i + 2];
      tileImageData.data[i + 3] = foregroundPixels[i + 3];
    }
  }

  game.cursorCtx.putImageData(tileImageData, drawX, drawY);
};

export function drawBalls(): void {
  for (let playerId = 0; playerId < game.playerCount; playerId++) {
    drawBall(playerId);
  }
}

export function drawAimLine(): void {
  const { playerX, playerY, currentPlayerId, mouseX, mouseY, shootingMode, cursorCtx, cursorImgData } = game;

  if (playerX === undefined || playerY === undefined || mouseX === undefined || mouseY === undefined) {
    log.warn('No data for drawing aim line', {
      playerX,
      playerY,
      mouseX,
      mouseY,
    });
    return;
  }

  cursorImgData.data.fill(0);
  const [playerDrawX, playerDrawY] = getPlayerPos(game.currentPlayerId);
  const power = getStrokePower(playerDrawX, playerDrawY, mouseX, mouseY);

  //ball
  const x1 = playerDrawX + 0.5;
  const y1 = playerDrawY + 0.5;

  //stroke power
  const x2 = playerDrawX + (power[0] * 200.0) / 6.5 + 0.5;
  const y2 = playerDrawY + (power[1] * 200.0) / 6.5 + 0.5;

  if (shootingMode === 0) {
    drawLine(cursorImgData, Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2));
  } else {
    let deltaX = x2 - x1;
    let deltaY = y2 - y1;
    drawDashedLine(cursorImgData, x1, y1, deltaX, deltaY);

    if (shootingMode == 1) {
      deltaX = -deltaX;
      deltaY = -deltaY;
    }

    let oldX;

    if (shootingMode == 2) {
      oldX = deltaX;
      deltaX = deltaY;
      deltaY = -oldX;
    }

    if (shootingMode == 3) {
      oldX = deltaX;
      deltaX = -deltaY;
      deltaY = oldX;
    }

    drawLine(cursorImgData, Math.round(x1), Math.round(y1), Math.round(x1 + deltaX), Math.round(y1 + deltaY));
  }
  cursorCtx.putImageData(cursorImgData, 0, 0);
  drawBalls();
}

function handlePlayerCollision(player1: number, player2: number): boolean {
  const x = game.playerX[player2] - game.playerX[player1];
  const y = game.playerY[player2] - game.playerY[player1];
  const distance = Math.sqrt(x * x + y * y);

  if (distance === 0 || distance > 13) {
    return false;
  }

  const forceX = x / distance;
  const forceY = y / distance;
  const p1Speed = game.speedX[player1] * forceX + game.speedY[player1] * forceY;
  const p2Speed = game.speedX[player2] * forceX + game.speedY[player2] * forceY;

  if (p1Speed - p2Speed <= 0) {
    return false;
  }

  const p1PerpSpeed = -game.speedX[player1] * forceY + game.speedY[player1] * forceX;
  const p2PerpSpeed = -game.speedX[player2] * forceY + game.speedY[player2] * forceX;
  game.speedX[player1] = p2Speed * forceX - p1PerpSpeed * forceY;
  game.speedY[player1] = p2Speed * forceY + p1PerpSpeed * forceX;
  game.speedX[player2] = p1Speed * forceX - p2PerpSpeed * forceY;
  game.speedY[player2] = p1Speed * forceY + p2PerpSpeed * forceX;
  return true;
}

function handleDownhill(playerId: number, tileId: number): boolean {
  if (tileId < 4 || tileId > 11) {
    return false;
  }

  if (tileId === 4) game.speedY[playerId] -= 0.025;
  if (tileId === 5) {
    game.speedY[playerId] -= 0.025 * MAGIC_OFFSET;
    game.speedX[playerId] += 0.025 * MAGIC_OFFSET;
  }
  if (tileId === 6) game.speedX[playerId] += 0.025;
  if (tileId === 7) {
    game.speedY[playerId] += 0.025 * MAGIC_OFFSET;
    game.speedX[playerId] += 0.025 * MAGIC_OFFSET;
  }
  if (tileId === 8) game.speedY[playerId] += 0.025;
  if (tileId === 9) {
    game.speedY[playerId] += 0.025 * MAGIC_OFFSET;
    game.speedX[playerId] -= 0.025 * MAGIC_OFFSET;
  }
  if (tileId === 10) game.speedX[playerId] -= 0.025;
  if (tileId === 11) {
    game.speedY[playerId] -= 0.025 * MAGIC_OFFSET;
    game.speedX[playerId] -= 0.025 * MAGIC_OFFSET;
  }

  return true;
}

function handleMagnetForce(playerId: number, mapX: number, mapY: number): boolean {
  if (!game.magnetMap) {
    return false;
  }

  const magnetX = Math.floor(mapX / 5);
  const magnetY = Math.floor(mapY / 5);
  const index = getMagnetMapIndex(magnetX, magnetY);
  const forceX = game.magnetMap[index];
  const forceY = game.magnetMap[index + 1];

  if (forceX === 0 && forceY === 0) {
    return false;
  }

  if (game.magnetSpeed > 0) {
    game.magnetSpeed -= 0.0001;
  }

  game.speedX[playerId] += game.magnetSpeed * forceX * 0.0005;
  game.speedY[playerId] += game.magnetSpeed * forceY * 0.0005;
  return true;
}

function handleTeleport(teleportId: number, playerId: number, x: number, y: number): void {
  let exits = game.teleportExits[teleportId];
  let selectedTeleportId = teleportId;

  if (exits.length === 0) {
    const starts = game.teleportStarts[teleportId];
    if (starts.length >= 2) {
      for (let attemptCount = 0; attemptCount < 100; attemptCount++) {
        const teleportPos = starts[game.seed.next() % starts.length];
        if (Math.abs(teleportPos[0] - x) >= 15 || Math.abs(teleportPos[1] - y) >= 15) {
          game.playerX[playerId] = teleportPos[0];
          game.playerY[playerId] = teleportPos[1];
          return;
        }
      }

      return;
    }

    const exitIds = game.teleportExits.map((group, index) => (group.length > 0 ? index : -1)).filter((index) => index >= 0);
    if (exitIds.length === 0) {
      return;
    }

    do {
      selectedTeleportId = game.seed.next() % 4;
      exits = game.teleportExits[selectedTeleportId];
    } while (exits.length === 0);
  }

  const teleportPos = exits[game.seed.next() % exits.length];
  game.playerX[playerId] = teleportPos[0];
  game.playerY[playerId] = teleportPos[1];
}

function handleMines(isBigMine: boolean, playerId: number, screenX: number, screenY: number): void {
  if (!game.currentMap) {
    return;
  }

  const mapX = Math.floor(screenX / TILE_SIZE);
  const mapY = Math.floor(screenY / TILE_SIZE);
  const tile = game.currentMap.tiles[mapX]?.[mapY];
  if (!tile) {
    return;
  }

  const special = getTileSpecial(tile);
  let shape = getSpecialShape(tile);
  const javaForeground = getJavaForeground(tile);
  const javaBackground = getJavaBackground(tile);

  if (special !== 2 || (shape !== 28 && shape !== 30)) {
    return;
  }

  shape += 1;
  updateTile(mapX, mapY, makeTileCode(special, shape, javaForeground, javaBackground));

  if (isBigMine) {
    const downhills = [17039367, 16779264, 17104905, 16778752, -1, 16779776, 17235973, 16778240, 17170443];
    let tileIndex = 0;

    for (let y = mapY - 1; y <= mapY + 1; y++) {
      for (let x = mapX - 1; x <= mapX + 1; x++) {
        if (
          x >= 0 &&
          x < 49 &&
          y >= 0 &&
          y < 25 &&
          (y !== mapY || x !== mapX) &&
          game.currentMap.tiles[x][y].tileCode === 16777216 &&
          downhills[tileIndex] >= 0
        ) {
          updateTile(x, y, downhills[tileIndex]);
        }

        tileIndex++;
      }
    }
  }

  let speed: number;
  do {
    do {
      game.speedX[playerId] = (-65 + (game.seed.next() % 131)) / 10;
      game.speedY[playerId] = (-65 + (game.seed.next() % 131)) / 10;
      speed = Math.hypot(game.speedX[playerId], game.speedY[playerId]);
    } while (speed < 5.2);
  } while (speed > 6.5);

  if (!isBigMine) {
    game.speedX[playerId] *= 0.8;
    game.speedY[playerId] *= 0.8;
  }

  redrawCurrentMap();
}

function isPlayerAtTile(tileX: number, tileY: number, playerX: number, playerY: number): boolean {
  return playerX > tileX * TILE_SIZE && playerX < tileX * TILE_SIZE + TILE_SIZE - 1 && playerY > tileY * TILE_SIZE && playerY < tileY * TILE_SIZE + TILE_SIZE - 1;
}

function canMovableBlockMove(tileX: number, tileY: number): number {
  if (!game.currentMap || tileX < 0 || tileX >= 49 || tileY < 0 || tileY >= 25) {
    return -1;
  }

  const tile = game.currentMap.tiles[tileX][tileY];
  const special = getTileSpecial(tile);
  const background = getJavaBackground(tile);
  if (special === 1 && tile.shape === 0 && background <= 15) {
    for (let playerId = 0; playerId < game.playerCount; playerId++) {
      if (isPlayerAtTile(tileX, tileY, game.playerX[playerId], game.playerY[playerId])) {
        return -1;
      }
    }

    return background;
  }

  return -1;
}

function calculateMovableBlockEndPosition(
  x: number,
  y: number,
  x1: number,
  y1: number,
  background: number,
  background1: number,
  nonSunkable: boolean,
  iteration: number,
): number[] {
  let result = [x1, y1, background1];
  if (!nonSunkable && background1 >= 4 && background1 <= 11 && iteration < 1078) {
    x = x1;
    y = y1;
    background = background1;

    if (background1 === 4 || background1 === 5 || background1 === 11) y1 -= 1;
    if (background1 === 8 || background1 === 7 || background1 === 9) y1 += 1;
    if (background1 === 5 || background1 === 6 || background1 === 7) x1 += 1;
    if (background1 === 9 || background1 === 10 || background1 === 11) x1 -= 1;

    background1 = canMovableBlockMove(x1, y1);
    if (background1 >= 0) {
      result = calculateMovableBlockEndPosition(x, y, x1, y1, background, background1, nonSunkable, iteration + 1);
    }
  }

  return result;
}

function handleMovableBlock(screenX: number, screenY: number, offsetX: number, offsetY: number, nonSunkable: boolean): boolean {
  if (!game.currentMap) {
    return false;
  }

  const mapX = Math.floor(screenX / TILE_SIZE);
  const mapY = Math.floor(screenY / TILE_SIZE);
  const tile = game.currentMap.tiles[mapX]?.[mapY];
  if (!tile) {
    return false;
  }

  const special = getTileSpecial(tile);
  const shape = getSpecialShape(tile);
  const background = getJavaBackground(tile);
  if (special !== 2 || (shape !== 27 && shape !== 46)) {
    return false;
  }

  const targetX = mapX + offsetX;
  const targetY = mapY + offsetY;
  const canMove = canMovableBlockMove(targetX, targetY);
  if (canMove === -1) {
    return false;
  }

  updateTile(mapX, mapY, 16777216 + background * 256);
  const [endX, endY, endBackground] = calculateMovableBlockEndPosition(
    mapX,
    mapY,
    targetX,
    targetY,
    background,
    canMove,
    nonSunkable,
    0,
  );

  if (!nonSunkable && (endBackground === 12 || endBackground === 13)) {
    updateTile(endX, endY, 35061760 + endBackground * 256);
  } else {
    updateTile(endX, endY, 33554432 + ((nonSunkable ? 27 : 46) - 24) * 256 * 256 + endBackground * 256);
  }

  redrawCurrentMap();
  return true;
}

function handleBreakableBlock(screenX: number, screenY: number): void {
  if (!game.currentMap) {
    return;
  }

  const mapX = Math.floor(screenX / TILE_SIZE);
  const mapY = Math.floor(screenY / TILE_SIZE);
  const tile = game.currentMap.tiles[mapX]?.[mapY];
  if (!tile) {
    return;
  }

  const special = getTileSpecial(tile);
  let shape = getSpecialShape(tile);
  const javaBackground = getJavaBackground(tile);
  const javaForeground = getJavaForeground(tile);

  if (special !== 2 || shape < 40 || shape > 43) {
    return;
  }

  shape += 1;
  if (shape <= 43) {
    updateTile(mapX, mapY, makeTileCode(special, shape, javaBackground, javaForeground));
  } else {
    updateTile(mapX, mapY, 16777216 + javaBackground * 256 + javaBackground);
  }

  redrawCurrentMap();
}

function handleWallCollision(playerId: number): void {
  const x = Math.floor(game.playerX[playerId] + 0.5);
  const y = Math.floor(game.playerY[playerId] + 0.5);
  const top = getCollisionAt(x, y - 6);
  const topright = getCollisionAt(x + DIAG_OFFSET, y - DIAG_OFFSET);
  const right = getCollisionAt(x + 6, y);
  const bottomright = getCollisionAt(x + DIAG_OFFSET, y + DIAG_OFFSET);
  const bottom = getCollisionAt(x, y + 6);
  const bottomleft = getCollisionAt(x - DIAG_OFFSET, y + DIAG_OFFSET);
  const left = getCollisionAt(x - 6, y);
  const topleft = getCollisionAt(x - DIAG_OFFSET, y - DIAG_OFFSET);

  let topCollide = isWallCollisionTile(top);
  let toprightCollide = isWallCollisionTile(topright);
  let rightCollide = isWallCollisionTile(right);
  let bottomrightCollide = isWallCollisionTile(bottomright);
  let bottomCollide = isWallCollisionTile(bottom);
  let bottomleftCollide = isWallCollisionTile(bottomleft);
  let leftCollide = isWallCollisionTile(left);
  let topleftCollide = isWallCollisionTile(topleft);

  if (topCollide && top === 20) topCollide = false;
  if (topleftCollide && topleft === 20) topleftCollide = false;
  if (toprightCollide && topright === 20) toprightCollide = false;
  if (leftCollide && left === 20) leftCollide = false;
  if (rightCollide && right === 20) rightCollide = false;

  if (rightCollide && right === 21) rightCollide = false;
  if (toprightCollide && topright === 21) toprightCollide = false;
  if (bottomrightCollide && bottomright === 21) bottomrightCollide = false;
  if (topCollide && top === 21) topCollide = false;
  if (bottomCollide && bottom === 21) bottomCollide = false;

  if (bottomCollide && bottom === 22) bottomCollide = false;
  if (bottomrightCollide && bottomright === 22) bottomrightCollide = false;
  if (bottomleftCollide && bottomleft === 22) bottomleftCollide = false;
  if (rightCollide && right === 22) rightCollide = false;
  if (leftCollide && left === 22) leftCollide = false;

  if (leftCollide && left === 23) leftCollide = false;
  if (bottomleftCollide && bottomleft === 23) bottomleftCollide = false;
  if (topleftCollide && topleft === 23) topleftCollide = false;
  if (bottomCollide && bottom === 23) bottomCollide = false;
  if (topCollide && top === 23) topCollide = false;

  if (
    topCollide &&
    toprightCollide &&
    rightCollide &&
    (top < 20 || top > 23) &&
    (topright < 20 || topright > 23) &&
    (right < 20 || right > 23)
  ) {
    rightCollide = false;
    topCollide = false;
  }

  if (
    rightCollide &&
    bottomrightCollide &&
    bottomCollide &&
    (right < 20 || right > 23) &&
    (bottomright < 20 || bottomright > 23) &&
    (bottom < 20 || bottom > 23)
  ) {
    bottomCollide = false;
    rightCollide = false;
  }

  if (
    bottomCollide &&
    bottomleftCollide &&
    leftCollide &&
    (bottom < 20 || bottom > 23) &&
    (bottomleft < 20 || bottomleft > 23) &&
    (left < 20 || left > 23)
  ) {
    leftCollide = false;
    bottomCollide = false;
  }

  if (
    leftCollide &&
    topleftCollide &&
    topCollide &&
    (left < 20 || left > 23) &&
    (topleft < 20 || topleft > 23) &&
    (top < 20 || top > 23)
  ) {
    topCollide = false;
    leftCollide = false;
  }

  let speedEffect: number;
  if (!topCollide && !rightCollide && !bottomCollide && !leftCollide) {
    let temp: number;

    if (
      toprightCollide &&
      ((game.speedX[playerId] > 0 && game.speedY[playerId] < 0) ||
        (game.speedX[playerId] < 0 && game.speedY[playerId] < 0 && -game.speedY[playerId] > -game.speedX[playerId]) ||
        (game.speedX[playerId] > 0 && game.speedY[playerId] > 0 && game.speedX[playerId] > game.speedY[playerId]))
    ) {
      speedEffect = getSpeedEffect(topright, playerId, x + DIAG_OFFSET, y - DIAG_OFFSET, 1, -1);
      temp = game.speedX[playerId];
      game.speedX[playerId] = game.speedY[playerId] * speedEffect;
      game.speedY[playerId] = temp * speedEffect;
    }

    if (
      bottomrightCollide &&
      ((game.speedX[playerId] > 0 && game.speedY[playerId] > 0) ||
        (game.speedX[playerId] > 0 && game.speedY[playerId] < 0 && game.speedX[playerId] > -game.speedY[playerId]) ||
        (game.speedX[playerId] < 0 && game.speedY[playerId] > 0 && game.speedY[playerId] > -game.speedX[playerId]))
    ) {
      speedEffect = getSpeedEffect(bottomright, playerId, x + DIAG_OFFSET, y + DIAG_OFFSET, 1, 1);
      temp = game.speedX[playerId];
      game.speedX[playerId] = -game.speedY[playerId] * speedEffect;
      game.speedY[playerId] = -temp * speedEffect;
    }

    if (
      bottomleftCollide &&
      ((game.speedX[playerId] < 0 && game.speedY[playerId] > 0) ||
        (game.speedX[playerId] > 0 && game.speedY[playerId] > 0 && game.speedY[playerId] > game.speedX[playerId]) ||
        (game.speedX[playerId] < 0 && game.speedY[playerId] < 0 && -game.speedX[playerId] > -game.speedY[playerId]))
    ) {
      speedEffect = getSpeedEffect(bottomleft, playerId, x - DIAG_OFFSET, y + DIAG_OFFSET, -1, 1);
      temp = game.speedX[playerId];
      game.speedX[playerId] = game.speedY[playerId] * speedEffect;
      game.speedY[playerId] = temp * speedEffect;
    }

    if (
      topleftCollide &&
      ((game.speedX[playerId] < 0 && game.speedY[playerId] < 0) ||
        (game.speedX[playerId] < 0 && game.speedY[playerId] > 0 && -game.speedX[playerId] > game.speedY[playerId]) ||
        (game.speedX[playerId] > 0 && game.speedY[playerId] < 0 && -game.speedY[playerId] > game.speedX[playerId]))
    ) {
      speedEffect = getSpeedEffect(topleft, playerId, x - DIAG_OFFSET, y - DIAG_OFFSET, -1, -1);
      temp = game.speedX[playerId];
      game.speedX[playerId] = -game.speedY[playerId] * speedEffect;
      game.speedY[playerId] = -temp * speedEffect;
    }
  } else {
    if (topCollide && game.speedY[playerId] < 0) {
      speedEffect = getSpeedEffect(top, playerId, x, y - 6, 0, -1);
      game.speedX[playerId] *= speedEffect;
      game.speedY[playerId] *= -speedEffect;
    } else if (bottomCollide && game.speedY[playerId] > 0) {
      speedEffect = getSpeedEffect(bottom, playerId, x, y + 6, 0, 1);
      game.speedX[playerId] *= speedEffect;
      game.speedY[playerId] *= -speedEffect;
    }

    if (rightCollide && game.speedX[playerId] > 0) {
      speedEffect = getSpeedEffect(right, playerId, x + 6, y, 1, 0);
      game.speedX[playerId] *= -speedEffect;
      game.speedY[playerId] *= speedEffect;
      return;
    }

    if (leftCollide && game.speedX[playerId] < 0) {
      speedEffect = getSpeedEffect(left, playerId, x - 6, y, -1, 0);
      game.speedX[playerId] *= -speedEffect;
      game.speedY[playerId] *= speedEffect;
    }
  }
}

function createShotState(): GameShotState {
  const shotState: GameShotState = {
    lastResetX: [],
    lastResetY: [],
    lastSafeX: [],
    lastSafeY: [],
    previousX: [],
    previousY: [],
    holeTimer: [],
    onHole: [],
    onLiquidOrSwamp: [],
    teleported: [],
    spinningStuckCounter: [],
    magnetStuckCounter: [],
    downhillStuckCounter: [],
    loopStuckCounter: 0,
  };

  for (let playerId = 0; playerId < game.playerCount; playerId++) {
    shotState.lastResetX[playerId] = game.playerX[playerId];
    shotState.lastResetY[playerId] = game.playerY[playerId];
    shotState.lastSafeX[playerId] = game.playerX[playerId];
    shotState.lastSafeY[playerId] = game.playerY[playerId];
    shotState.previousX[playerId] = game.playerX[playerId];
    shotState.previousY[playerId] = game.playerY[playerId];
    shotState.holeTimer[playerId] = game.onHoleSync[playerId] ? HOLE_DONE_TIMER : 0;
    shotState.onHole[playerId] = false;
    shotState.onLiquidOrSwamp[playerId] = false;
    shotState.teleported[playerId] = false;
    shotState.spinningStuckCounter[playerId] = 0;
    shotState.magnetStuckCounter[playerId] = 0;
    shotState.downhillStuckCounter[playerId] = 0;
  }

  return shotState;
}

function stepPlayerPhysics(playerId: number, shotState: GameShotState): boolean {
  if (game.onHoleSync[playerId]) {
    return false;
  }

  let playerStillActive = false;

  for (let physicsIteration = 0; physicsIteration < PHYSICS_ITERATIONS_PER_FRAME; physicsIteration++) {
    let center = getCollisionAt(game.playerX[playerId], game.playerY[playerId]);
    let top = 0;
    let topright = 0;
    let right = 0;
    let bottomright = 0;
    let bottom = 0;
    let bottomleft = 0;
    let left = 0;
    let topleft = 0;
    let onLiquid = false;

    for (let substep = 0; substep < PHYSICS_SUBSTEPS; substep++) {
      setPlayerPosRel(playerId, game.speedX[playerId] * 0.1, game.speedY[playerId] * 0.1);

      if (game.playerX[playerId] < 6.6) {
        setPlayerX(playerId, 6.6);
      }

      if (game.playerX[playerId] >= 727.9) {
        setPlayerX(playerId, 727.9);
      }

      if (game.playerY[playerId] < 6.6) {
        setPlayerY(playerId, 6.6);
      }

      if (game.playerY[playerId] >= 367.9) {
        setPlayerY(playerId, 367.9);
      }

      if (game.collisionMode === 1 && !shotState.onHole[playerId] && !shotState.onLiquidOrSwamp[playerId]) {
        for (let anotherPlayer = 0; anotherPlayer < game.playerCount; anotherPlayer++) {
          if (
            playerId !== anotherPlayer &&
            !game.onHoleSync[anotherPlayer] &&
            !shotState.onHole[anotherPlayer] &&
            !shotState.onLiquidOrSwamp[anotherPlayer] &&
            handlePlayerCollision(playerId, anotherPlayer)
          ) {
            game.speedX[playerId] *= 0.75;
            game.speedY[playerId] *= 0.75;
            game.speedX[anotherPlayer] *= 0.75;
            game.speedY[anotherPlayer] *= 0.75;
            playerStillActive = true;
          }
        }
      }

      const x = Math.floor(game.playerX[playerId] + 0.5);
      const y = Math.floor(game.playerY[playerId] + 0.5);
      center = getCollisionAt(x, y);
      top = getCollisionAt(x, y - 6);
      topright = getCollisionAt(x + DIAG_OFFSET, y - DIAG_OFFSET);
      right = getCollisionAt(x + 6, y);
      bottomright = getCollisionAt(x + DIAG_OFFSET, y + DIAG_OFFSET);
      bottom = getCollisionAt(x, y + 6);
      bottomleft = getCollisionAt(x - DIAG_OFFSET, y + DIAG_OFFSET);
      left = getCollisionAt(x - 6, y);
      topleft = getCollisionAt(x - DIAG_OFFSET, y - DIAG_OFFSET);

      if (center === 12 || center === 13) {
        game.speedX[playerId] *= 0.97;
        game.speedY[playerId] *= 0.97;
        onLiquid = true;
      } else {
        onLiquid = center === 14 || center === 15;
      }

      let teleportCounter = 0;
      for (let teleportId = 32; teleportId <= 38; teleportId += 2) {
        if (
          top === teleportId ||
          topright === teleportId ||
          right === teleportId ||
          bottomright === teleportId ||
          bottom === teleportId ||
          bottomleft === teleportId ||
          left === teleportId ||
          topleft === teleportId
        ) {
          teleportCounter++;
          if (!shotState.teleported[playerId]) {
            handleTeleport((teleportId - 32) / 2, playerId, x, y);
            shotState.teleported[playerId] = true;
          }
        }
      }

      if (teleportCounter === 0) {
        shotState.teleported[playerId] = false;
      }

      if (center === 28 || center === 30) {
        handleMines(center === 30, playerId, x, y);
      }

      handleWallCollision(playerId);
    }

    const x = Math.floor(game.playerX[playerId] + 0.5);
    const y = Math.floor(game.playerY[playerId] + 0.5);
    center = getCollisionAt(x, y);
    top = getCollisionAt(x, y - 6);
    topright = getCollisionAt(x + DIAG_OFFSET, y - DIAG_OFFSET);
    right = getCollisionAt(x + 6, y);
    bottomright = getCollisionAt(x + DIAG_OFFSET, y + DIAG_OFFSET);
    bottom = getCollisionAt(x, y + 6);
    bottomleft = getCollisionAt(x - DIAG_OFFSET, y + DIAG_OFFSET);
    left = getCollisionAt(x - 6, y);
    topleft = getCollisionAt(x - DIAG_OFFSET, y - DIAG_OFFSET);
    onLiquid = center === 12 || center === 13 || center === 14 || center === 15;

    const isDownhill = handleDownhill(playerId, center);
    let isAffectedByMagnet = false;
    if (game.magnetMap && !onLiquid && !shotState.onHole[playerId] && !shotState.onLiquidOrSwamp[playerId]) {
      isAffectedByMagnet = handleMagnetForce(playerId, x, y);
    }

    let shouldSpinAroundHole = false;
    if (
      center === 25 ||
      getCollisionAt(x, y - 1) === 25 ||
      getCollisionAt(x + 1, y) === 25 ||
      getCollisionAt(x, y + 1) === 25 ||
      getCollisionAt(x - 1, y) === 25
    ) {
      const holeSpeed = center === 25 ? 1 : 0.5;
      shouldSpinAroundHole = true;
      let holeCounter = 0;

      if (top === 25) holeCounter++;
      else game.speedY[playerId] += holeSpeed * 0.03;

      if (topright === 25) holeCounter++;
      else {
        game.speedY[playerId] += holeSpeed * 0.03 * MAGIC_OFFSET;
        game.speedX[playerId] -= holeSpeed * 0.03 * MAGIC_OFFSET;
      }

      if (right === 25) holeCounter++;
      else game.speedX[playerId] -= holeSpeed * 0.03;

      if (bottomright === 25) holeCounter++;
      else {
        game.speedY[playerId] -= holeSpeed * 0.03 * MAGIC_OFFSET;
        game.speedX[playerId] -= holeSpeed * 0.03 * MAGIC_OFFSET;
      }

      if (bottom === 25) holeCounter++;
      else game.speedY[playerId] -= holeSpeed * 0.03;

      if (bottomleft === 25) holeCounter++;
      else {
        game.speedY[playerId] -= holeSpeed * 0.03 * MAGIC_OFFSET;
        game.speedX[playerId] += holeSpeed * 0.03 * MAGIC_OFFSET;
      }

      if (left === 25) holeCounter++;
      else game.speedX[playerId] += holeSpeed * 0.03;

      if (topleft === 25) holeCounter++;
      else {
        game.speedY[playerId] += holeSpeed * 0.03 * MAGIC_OFFSET;
        game.speedX[playerId] += holeSpeed * 0.03 * MAGIC_OFFSET;
      }

      if (holeCounter >= 7) {
        shouldSpinAroundHole = false;
        shotState.onHole[playerId] = true;
        setPlayerSpeed(playerId, 0, 0);
      }
    }

    if (shouldSpinAroundHole) {
      shotState.spinningStuckCounter[playerId]++;
      if (shotState.spinningStuckCounter[playerId] > 500) {
        shouldSpinAroundHole = false;
      }
    } else {
      shotState.spinningStuckCounter[playerId] = 0;
    }

    if (
      !isDownhill &&
      !isAffectedByMagnet &&
      !shouldSpinAroundHole &&
      !shotState.onHole[playerId] &&
      !shotState.onLiquidOrSwamp[playerId] &&
      !onLiquid
    ) {
      shotState.lastSafeX[playerId] = game.playerX[playerId];
      shotState.lastSafeY[playerId] = game.playerY[playerId];
    }

    center = getCollisionAt(game.playerX[playerId], game.playerY[playerId]);
    const speed = Math.hypot(game.speedX[playerId], game.speedY[playerId]);
    if (speed > 0) {
      const frictionFactor = calculateFriction(center, speed);
      let nextSpeedX = game.speedX[playerId] * frictionFactor;
      let nextSpeedY = game.speedY[playerId] * frictionFactor;
      let nextSpeed = speed * frictionFactor;

      if (nextSpeed > 7) {
        const clamp = 7 / nextSpeed;
        nextSpeedX *= clamp;
        nextSpeedY *= clamp;
        nextSpeed *= clamp;
      }

      setPlayerSpeed(playerId, nextSpeedX, nextSpeedY);

      if (nextSpeed < 0.075) {
        setPlayerSpeed(playerId, 0, 0);
      }
    }

    let nextSpeed = Math.hypot(game.speedX[playerId], game.speedY[playerId]);
    if (shotState.loopStuckCounter > 4000) {
      game.bounciness = 0;
      if (shotState.loopStuckCounter > 7000) {
        isAffectedByMagnet = false;
        nextSpeed = 0;
        if (!isDownhill) {
          setPlayerSpeed(playerId, 0, 0);
        }
      }
    }

    if (isDownhill && nextSpeed < 0.22499999999999998) {
      shotState.downhillStuckCounter[playerId]++;
      if (shotState.downhillStuckCounter[playerId] >= 250) {
        setPlayerSpeed(playerId, 0, 0);
      }
    } else {
      shotState.downhillStuckCounter[playerId] = 0;
    }

    if (isAffectedByMagnet && nextSpeed < 0.22499999999999998) {
      shotState.magnetStuckCounter[playerId]++;
      if (shotState.magnetStuckCounter[playerId] >= 150) {
        isAffectedByMagnet = false;
      }
    } else {
      shotState.magnetStuckCounter[playerId] = 0;
    }

    if (
      nextSpeed < 0.075 &&
      !isDownhill &&
      !isAffectedByMagnet &&
      !shouldSpinAroundHole &&
      !shotState.onHole[playerId] &&
      !shotState.onLiquidOrSwamp[playerId]
    ) {
      setPlayerSpeed(playerId, 0, 0);
      if (isLiquidTile(center)) {
        shotState.onLiquidOrSwamp[playerId] = true;
      }
    }

    if (shotState.onHole[playerId] || shotState.onLiquidOrSwamp[playerId]) {
      shotState.holeTimer[playerId] += 0.1;
      playerStillActive = true;

      if (
        (shotState.onHole[playerId] && shotState.holeTimer[playerId] > HOLE_DONE_TIMER) ||
        (shotState.onLiquidOrSwamp[playerId] && shotState.holeTimer[playerId] > LIQUID_DONE_TIMER)
      ) {
        if (center === 25) {
          game.onHoleSync[playerId] = true;
          setPlayerSpeed(playerId, 0, 0);
        } else if (center === 12 || center === 14) {
          setPlayerX(playerId, game.waterMode === 0 ? shotState.lastResetX[playerId] : shotState.lastSafeX[playerId]);
          setPlayerY(playerId, game.waterMode === 0 ? shotState.lastResetY[playerId] : shotState.lastSafeY[playerId]);
          setPlayerSpeed(playerId, 0, 0);
        } else if (center === 13 || center === 15) {
          resetPlayerPosition(playerId);
          setPlayerSpeed(playerId, 0, 0);
        }

        shotState.holeTimer[playerId] = 0;
        shotState.onHole[playerId] = false;
        shotState.onLiquidOrSwamp[playerId] = false;
        playerStillActive = false;
      }
    } else if (Math.hypot(game.speedX[playerId], game.speedY[playerId]) >= 0.075 || isDownhill || isAffectedByMagnet || shouldSpinAroundHole) {
      playerStillActive = true;
    }

    shotState.loopStuckCounter++;
  }

  return playerStillActive;
}

export function startShotLoop() {
  game.bounciness = 1;
  game.magnetSpeed = 1;
  game.shotState = createShotState();
  shootDrawLoop();
}

export function replayJavaShot(result: JavaShotResult): void {
  if (game.animationFrameId !== null) {
    cancelAnimationFrame(game.animationFrameId);
  }

  let frameIndex = 0;
  const frames = result.frames.length > 0 ? result.frames : [result.playerX.flatMap((x, i) => [x, result.playerY[i]])];

  const drawFrame = () => {
    const frame = frames[Math.min(frameIndex, frames.length - 1)];
    for (let playerId = 0; playerId < game.playerCount; playerId++) {
      setPlayerX(playerId, frame[playerId * 2] ?? game.playerX[playerId]);
      setPlayerY(playerId, frame[playerId * 2 + 1] ?? game.playerY[playerId]);
    }

    game.cursorCtx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    drawBalls();
    frameIndex++;

    if (frameIndex < frames.length) {
      game.animationFrameId = requestAnimationFrame(drawFrame);
      return;
    }

    for (let playerId = 0; playerId < game.playerCount; playerId++) {
      setPlayerX(playerId, result.playerX[playerId]);
      setPlayerY(playerId, result.playerY[playerId]);
      setPlayerSpeed(playerId, result.speedX[playerId] ?? 0, result.speedY[playerId] ?? 0);
      game.onHoleSync[playerId] = result.onHole[playerId] ?? game.onHoleSync[playerId];
    }

    game.seed.setRaw(result.seedRaw);
    applyJavaMapTiles(result.mapTiles);
    if (game.currentMap) {
      renderMap(game.currentMap);
    }
    game.animationFrameId = null;
    game.shotState = null;
    game.gameBusy = false;
    game.onTurnComplete?.();
    drawAimLine();
  };

  game.gameBusy = true;
  drawFrame();
}

function shootDrawLoop() {
  const shotState = game.shotState ?? createShotState();
  game.shotState = shotState;
  let anyBallMoving = false;

  for (let i = 0; i < game.playerCount; ++i) {
    anyBallMoving = stepPlayerPhysics(i, shotState) || anyBallMoving;
  }

  game.cursorCtx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  drawBalls();

  if (anyBallMoving) {
    game.animationFrameId = requestAnimationFrame(shootDrawLoop);
  } else {
    for (let i = 0; i < game.playerCount; ++i) {
      setPlayerSpeed(i, 0, 0);
    }
    game.animationFrameId = null;
    game.shotState = null;
    game.gameBusy = false;
    game.onTurnComplete?.();
    drawAimLine();
  }
}
