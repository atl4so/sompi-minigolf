import { rgbToLong } from '~/utils/color';
import { log } from '~/utils/logger';
import { GAME_HEIGHT, GAME_WIDTH, HALF_BALL, HALF_TILE, TILE_SIZE } from './constants';
import { drawDashedLine, drawLine } from './draw';
import { MinigolfMap } from './minigolfMap';
import { getPlayerPos, getStrokePower, setPlayerPosRel, setPlayerSpeed, setPlayerX, setPlayerY } from './physics';
import { getPixelMask, spriteManager } from './spriteManager';

interface MapRenderResult {
  startPositions: number[][];
}

const MAGIC_OFFSET = Math.sqrt(2) / 2;
const DIAG_OFFSET = Math.floor(6 * MAGIC_OFFSET + 0.5);
const PHYSICS_ITERATIONS_PER_FRAME = 2;
const PHYSICS_SUBSTEPS = 10;

let bounciness = 1;

function getCollisionMapIndex(x: number, y: number): number {
  return Math.floor(y) * GAME_WIDTH + Math.floor(x);
}

function getCollisionAt(x: number, y: number): number {
  const clampedX = Math.max(0, Math.min(GAME_WIDTH - 1, Math.floor(x)));
  const clampedY = Math.max(0, Math.min(GAME_HEIGHT - 1, Math.floor(y)));
  return game.collisionMap?.[getCollisionMapIndex(clampedX, clampedY)] ?? 0;
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

function getSpeedEffect(tileId: number, playerId: number): number {
  if (tileId === 16) {
    return 0.81;
  }

  if (tileId === 17) {
    return 0.05;
  }

  if (tileId === 18) {
    if (bounciness <= 0) {
      return 0.84;
    }

    bounciness -= 0.01;
    const speed = Math.hypot(game.speedX[playerId], game.speedY[playerId]);
    return speed === 0 ? 0.84 : (bounciness * 6.5) / speed;
  }

  if (tileId >= 20 && tileId <= 23) {
    return 0.82;
  }

  if (tileId === 27 || tileId === 46) {
    return 0.8;
  }

  if (tileId >= 40 && tileId <= 43) {
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

export const tileToDrawPosition = (tileX: number, tileY: number) =>
  [Math.floor(tileX * TILE_SIZE), Math.floor(tileY * TILE_SIZE)] as const;

export const drawBall = (playerId: number): void => {
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
      speedEffect = getSpeedEffect(topright, playerId);
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
      speedEffect = getSpeedEffect(bottomright, playerId);
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
      speedEffect = getSpeedEffect(bottomleft, playerId);
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
      speedEffect = getSpeedEffect(topleft, playerId);
      temp = game.speedX[playerId];
      game.speedX[playerId] = -game.speedY[playerId] * speedEffect;
      game.speedY[playerId] = -temp * speedEffect;
    }
  } else {
    if (topCollide && game.speedY[playerId] < 0) {
      speedEffect = getSpeedEffect(top, playerId);
      game.speedX[playerId] *= speedEffect;
      game.speedY[playerId] *= -speedEffect;
    } else if (bottomCollide && game.speedY[playerId] > 0) {
      speedEffect = getSpeedEffect(bottom, playerId);
      game.speedX[playerId] *= speedEffect;
      game.speedY[playerId] *= -speedEffect;
    }

    if (rightCollide && game.speedX[playerId] > 0) {
      speedEffect = getSpeedEffect(right, playerId);
      game.speedX[playerId] *= -speedEffect;
      game.speedY[playerId] *= speedEffect;
      return;
    }

    if (leftCollide && game.speedX[playerId] < 0) {
      speedEffect = getSpeedEffect(left, playerId);
      game.speedX[playerId] *= -speedEffect;
      game.speedY[playerId] *= speedEffect;
    }
  }
}

function stepPlayerPhysics(playerId: number): boolean {
  for (let physicsIteration = 0; physicsIteration < PHYSICS_ITERATIONS_PER_FRAME; physicsIteration++) {
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

      handleWallCollision(playerId);
    }

    const center = getCollisionAt(game.playerX[playerId], game.playerY[playerId]);
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
  }

  return Math.hypot(game.speedX[playerId], game.speedY[playerId]) >= 0.075;
}

export function startShotLoop() {
  bounciness = 1;
  shootDrawLoop();
}

function shootDrawLoop() {
  let anyBallMoving = false;

  for (let i = 0; i < game.playerCount; ++i) {
    anyBallMoving = stepPlayerPhysics(i) || anyBallMoving;
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
    game.gameBusy = false;
    game.onTurnComplete?.();
    drawAimLine();
  }
}
