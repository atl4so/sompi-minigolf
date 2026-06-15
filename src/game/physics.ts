import { log } from '~/utils/logger';
import { BALL_SIZE, GAME_HEIGHT, GAME_WIDTH, HALF_BALL, TILE_SIZE } from './constants';
import { drawAimLine, shootDrawLoop } from './renderer';

export interface StrokeInput {
  playerId: number;
  mouseX: number;
  mouseY: number;
  shootingMode: number;
}

/**
 * Sets player X position (px)
 * @param playerId
 * @param px
 */
export function setPlayerX(playerId: number, px: number): void {
  globalThis.game.playerX[playerId] = px;
}

/**
 * Sets player Y position (px)
 * @param playerId
 * @param px
 */
export function setPlayerY(playerId: number, px: number): void {
  globalThis.game.playerY[playerId] = px;
}

/**
 * Sets player position (px)
 * @param playerId
 * @param x
 * @param y
 */
export function setPlayerPos(playerId: number, x: number, y: number): void {
  setPlayerX(playerId, x);
  setPlayerY(playerId, y);
}

/**
 * Sets player position relatively (px)
 * @param playerId
 * @param x
 * @param y
 */
export function setPlayerPosRel(playerId: number, x: number, y: number): void {
  const [oldX, oldY] = getPlayerPos(playerId);
  setPlayerX(playerId, oldX + x);
  setPlayerY(playerId, oldY + y);
}

/**
 * @param playerId
 * @returns Player X position
 */
export function getPlayerX(playerId: number): number {
  return game.playerX[playerId];
}

/**
 * @param playerId
 * @returns Player Y position
 */
export function getPlayerY(playerId: number): number {
  return game.playerY[playerId];
}

/**
 * @param playerId
 * @returns `[number, number]` array of player position (pixels)
 */
export const getPlayerPos = (playerId: number): [number, number] => [getPlayerX(playerId), getPlayerY(playerId)];

/**
 * Sets X speed of player
 * @param playerId
 * @param speed
 */
export function setPlayerSpeedX(playerId: number, speed: number): void {
  globalThis.game.speedX[playerId] = speed;
}

/**
 * Sets Y speed of player
 * @param playerId
 * @param speed
 */
export function setPlayerSpeedY(playerId: number, speed: number): void {
  globalThis.game.speedY[playerId] = speed;
}

/**
 * Sets player speed
 * @param playerId
 * @param speedX
 * @param speedY
 */
export function setPlayerSpeed(playerId: number, speedX: number, speedY: number): void {
  setPlayerSpeedX(playerId, speedX);
  setPlayerSpeedY(playerId, speedY);
}

/**
 * Sets player speed relatively
 * @param playerId
 * @param speedX
 * @param speedY
 */
export function setPlayerSpeedRel(playerId: number, speedX: number, speedY: number): void {
  const [oldSpeedX, oldSpeedY] = getPlayerSpeed(playerId);
  setPlayerSpeed(playerId, oldSpeedX + speedX, oldSpeedY + speedY);
}

/**
 * @param playerId
 * @returns Player X speed
 */
export function getPlayerSpeedX(playerId: number): number {
  return game.speedX[playerId];
}

/**
 * @param playerId
 * @returns Player Y speed
 */
export function getPlayerSpeedY(playerId: number): number {
  return game.speedY[playerId];
}

/**
 * @param playerId
 * @returns `[number, number]` array of player speed
 */
export function getPlayerSpeed(playerId: number): [number, number] {
  return [getPlayerSpeedX(playerId), getPlayerSpeedY(playerId)];
}

export function getStrokePower(playerX: number, playerY: number, mouseX: number, mouseY: number): [number, number] {
  const subX = playerX - mouseX;
  const subY = playerY - mouseY;
  const distance = Math.sqrt(subX * subX + subY * subY);
  let scale = (distance - 5.0) / 30.0;

  // Minimum stroke force
  if (scale < 0.075) {
    scale = 0.075;
  }

  // Maximum stroke force
  if (scale > 6.5) {
    scale = 6.5;
  }

  if (distance === 0) {
    return [0, 0];
  }

  const var12 = scale / distance; // TODO
  return [(mouseX - playerX) * var12, (mouseY - playerY) * var12];
}

export function isMouseInsideBall(playerId: number): boolean {
  const playerDrawX = game.playerX[playerId];
  const playerDrawY = game.playerY[playerId];

  const subX = playerDrawX + HALF_BALL - game.mouseX;
  const subY = playerDrawY + HALF_BALL - game.mouseY;
  return Math.sqrt(subX * subX + subY * subY) < HALF_BALL;
}

export function doStroke(playerId: number, stroke?: StrokeInput, emitLocalStroke = true): void {
  const mouseX = stroke?.mouseX ?? game.mouseX;
  const mouseY = stroke?.mouseY ?? game.mouseY;
  const shootingMode = stroke?.shootingMode ?? game.shootingMode;
  const audio = new Audio('/assets/sounds/gamemove.wav');
  audio.play().catch(() => undefined);
  log.debug(`Doing stroke @ (${mouseX}, ${mouseY})`);

  const [powerX, powerY] = getStrokePower(...getPlayerPos(playerId), mouseX, mouseY);
  setPlayerSpeed(playerId, powerX, powerY);

  if (shootingMode === 1) {
    setPlayerSpeed(playerId, -getPlayerSpeedX(playerId), -getPlayerSpeedY(playerId));
  }

  if (shootingMode === 2) {
    const speedX = getPlayerSpeedX(playerId);
    const speedY = getPlayerSpeedY(playerId);
    setPlayerSpeed(playerId, speedY, -speedX);
  }

  if (shootingMode === 3) {
    const speedX = getPlayerSpeedX(playerId);
    const speedY = getPlayerSpeedY(playerId);
    setPlayerSpeed(playerId, -speedY, speedX);
  }

  const [speedX, speedY] = getPlayerSpeed(playerId);
  const speed = Math.sqrt(speedX * speedX + speedY * speedY);
  let scaledSpeed = speed / 6.5; // Some scaling? Not sure
  scaledSpeed *= scaledSpeed; // ?

  // This is the part where you add randomness to the shot, currently disabled
  setPlayerSpeedRel(playerId, scaledSpeed / 100000.0 - 0.25, scaledSpeed / 100000.0 - 0.25);

  /*
  isLocalPlayer = isLocalPlayer;
  gameState = 2;
  Boolean2843 = false;
  */

  globalThis.game.gameBusy = true;
  if (emitLocalStroke) {
    game.onLocalStroke?.({
      playerId,
      mouseX,
      mouseY,
      shootingMode,
    });
  }
  shootDrawLoop();
}

function getTileAtPixel(x: number, y: number) {
  const map = game.currentMap;
  if (!map) {
    return null;
  }

  const tileX = Math.floor(x / TILE_SIZE);
  const tileY = Math.floor(y / TILE_SIZE);

  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
    return null;
  }

  return map.tiles[tileX][tileY];
}

function canBallOccupy(x: number, y: number): boolean {
  const samplePoints = [
    [x + HALF_BALL, y + HALF_BALL],
    [x + 1, y + HALF_BALL],
    [x + BALL_SIZE - 1, y + HALF_BALL],
    [x + HALF_BALL, y + 1],
    [x + HALF_BALL, y + BALL_SIZE - 1],
  ];

  return samplePoints.every(([sampleX, sampleY]) => {
    const tile = getTileAtPixel(sampleX, sampleY);
    return tile?.isPassable ?? false;
  });
}

function clampToCourse(playerId: number): void {
  if (game.playerX[playerId] < 0) {
    setPlayerX(playerId, 0);
    setPlayerSpeedX(playerId, Math.abs(getPlayerSpeedX(playerId)) * 0.72);
  }

  if (game.playerX[playerId] > GAME_WIDTH - BALL_SIZE) {
    setPlayerX(playerId, GAME_WIDTH - BALL_SIZE);
    setPlayerSpeedX(playerId, -Math.abs(getPlayerSpeedX(playerId)) * 0.72);
  }

  if (game.playerY[playerId] < 0) {
    setPlayerY(playerId, 0);
    setPlayerSpeedY(playerId, Math.abs(getPlayerSpeedY(playerId)) * 0.72);
  }

  if (game.playerY[playerId] > GAME_HEIGHT - BALL_SIZE) {
    setPlayerY(playerId, GAME_HEIGHT - BALL_SIZE);
    setPlayerSpeedY(playerId, -Math.abs(getPlayerSpeedY(playerId)) * 0.72);
  }
}

function handleHole(playerId: number): boolean {
  const tile = getTileAtPixel(game.playerX[playerId] + HALF_BALL, game.playerY[playerId] + HALF_BALL);
  if (!tile?.isHole) {
    return false;
  }

  setPlayerSpeed(playerId, 0, 0);
  return true;
}

export function stepPhysics(playerId: number): boolean {
  const speedX = getPlayerSpeedX(playerId);
  const speedY = getPlayerSpeedY(playerId);
  const speed = Math.sqrt(speedX * speedX + speedY * speedY);

  if (speed < 0.04 || handleHole(playerId)) {
    setPlayerSpeed(playerId, 0, 0);
    return false;
  }

  let nextX = game.playerX[playerId] + speedX;
  let nextY = game.playerY[playerId] + speedY;

  if (canBallOccupy(nextX, game.playerY[playerId])) {
    setPlayerX(playerId, nextX);
  } else {
    setPlayerSpeedX(playerId, -speedX * 0.72);
    nextX = game.playerX[playerId] + getPlayerSpeedX(playerId);
    if (canBallOccupy(nextX, game.playerY[playerId])) {
      setPlayerX(playerId, nextX);
    }
  }

  if (canBallOccupy(game.playerX[playerId], nextY)) {
    setPlayerY(playerId, nextY);
  } else {
    setPlayerSpeedY(playerId, -speedY * 0.72);
    nextY = game.playerY[playerId] + getPlayerSpeedY(playerId);
    if (canBallOccupy(game.playerX[playerId], nextY)) {
      setPlayerY(playerId, nextY);
    }
  }

  clampToCourse(playerId);

  setPlayerSpeed(playerId, getPlayerSpeedX(playerId) * 0.985, getPlayerSpeedY(playerId) * 0.985);
  return true;
}

export function finishStroke(): void {
  game.gameBusy = false;
  game.onTurnComplete?.();
  drawAimLine();
}
