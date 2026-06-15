import { log } from '~/utils/logger';
import { HALF_BALL } from './constants';
import { simulateJavaShot } from './javaEngine';
import { replayJavaShot, startShotLoop } from './renderer';

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

export function resetPlayerPosition(playerId: number): void {
  if (game.resetPositionX[playerId] >= 0 && game.resetPositionY[playerId] >= 0) {
    setPlayerPos(playerId, game.resetPositionX[playerId], game.resetPositionY[playerId]);
    return;
  }

  if (game.startPositionX >= 0 && game.startPositionY >= 0) {
    setPlayerPos(playerId, game.startPositionX, game.startPositionY);
    return;
  }

  setPlayerPos(playerId, 367.5, 187.5);
}

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

  const subX = playerDrawX - game.mouseX;
  const subY = playerDrawY - game.mouseY;
  return Math.sqrt(subX * subX + subY * subY) < HALF_BALL;
}

function applyStrokeVelocity(playerId: number, mouseX: number, mouseY: number, shootingMode: number): void {
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

  const speed = Math.hypot(getPlayerSpeedX(playerId), getPlayerSpeedY(playerId));
  const speedVariance = (speed / 6.5) ** 2;
  setPlayerSpeed(
    playerId,
    getPlayerSpeedX(playerId) + speedVariance * ((game.seed.next() % 50001) / 100000 - 0.25),
    getPlayerSpeedY(playerId) + speedVariance * ((game.seed.next() % 50001) / 100000 - 0.25),
  );
}

export function doStroke(playerId: number, stroke?: StrokeInput, emitLocalStroke = true): void {
  const mouseX = stroke?.mouseX ?? game.mouseX;
  const mouseY = stroke?.mouseY ?? game.mouseY;
  const shootingMode = stroke?.shootingMode ?? game.shootingMode;
  const strokeInput = {
    playerId,
    mouseX,
    mouseY,
    shootingMode,
  };
  const audio = new Audio('/assets/sounds/gamemove.wav');
  audio.play().catch(() => undefined);
  log.debug(`Doing stroke @ (${mouseX}, ${mouseY})`);

  /*
  isLocalPlayer = isLocalPlayer;
  gameState = 2;
  Boolean2843 = false;
  */

  globalThis.game.gameBusy = true;
  if (emitLocalStroke) {
    game.onLocalStroke?.(strokeInput);
  }

  simulateJavaShot(strokeInput)
    .then((result) => {
      if (result) {
        replayJavaShot(result);
        return;
      }

      applyStrokeVelocity(playerId, mouseX, mouseY, shootingMode);
      startShotLoop();
    })
    .catch(() => {
      applyStrokeVelocity(playerId, mouseX, mouseY, shootingMode);
      startShotLoop();
    });
}
