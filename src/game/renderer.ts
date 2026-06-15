import { rgbToLong } from '~/utils/color';
import { log } from '~/utils/logger';
import { GAME_HEIGHT, GAME_WIDTH, HALF_BALL, TILE_SIZE } from './constants';
import { drawDashedLine, drawLine } from './draw';
import { MinigolfMap } from './minigolfMap';
import { getPlayerPos, getStrokePower, setPlayerPosRel, setPlayerSpeed, setPlayerX, setPlayerY } from './physics';
import { spriteManager } from './spriteManager';

interface MapRenderResult {
  startPositions: number[][];
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
            startPositions.push([drawAtX, drawAtY]);
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

  return {
    startPositions,
  };
}

export const tileToDrawPosition = (tileX: number, tileY: number) =>
  [Math.floor(tileX * TILE_SIZE), Math.floor(tileY * TILE_SIZE)] as const;

export const drawBall = (playerId: number): void => {
  const [playerDrawX, playerDrawY] = getPlayerPos(playerId);
  const foregroundPixels = game.cursorCtx.getImageData(...getPlayerPos(playerId), 15, 15).data;
  spriteManager.balls[playerId].draw(game.cursorCtx, playerDrawX + 1, playerDrawY + 1);

  const tileImageData = game.cursorCtx.getImageData(playerDrawX, playerDrawY, 15, 15);
  const tilePixels = tileImageData.data;
  for (let i = 0; i < tilePixels.length; i += 4) {
    if (rgbToLong(tilePixels[i], tilePixels[i + 1], tilePixels[i + 2]) == 0xccccff || tilePixels[i + 3] == 0) {
      tileImageData.data[i] = foregroundPixels[i];
      tileImageData.data[i + 1] = foregroundPixels[i + 1];
      tileImageData.data[i + 2] = foregroundPixels[i + 2];
      tileImageData.data[i + 3] = foregroundPixels[i + 3];
    }
  }

  game.cursorCtx.putImageData(tileImageData, playerDrawX, playerDrawY);
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
  const x1 = playerDrawX + HALF_BALL + 0.5;
  const y1 = playerDrawY + HALF_BALL + 0.5;

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

export function shootDrawLoop() {
  let anyBallMoving = false;

  for (let i = 0; i < game.playerCount; ++i) {
    setPlayerPosRel(i, game.speedX[i] * 0.1, game.speedY[i] * 0.1);

    if (game.playerX[i] < 6.6) {
      setPlayerX(i, 6.6);
    }

    if (game.playerX[i] > 727.9) {
      setPlayerX(i, 727.9);
    }

    if (game.playerY[i] < 6.6) {
      setPlayerY(i, 6.6);
    }

    if (game.playerY[i] > 367.9) {
      setPlayerY(i, 367.9);
    }

    setPlayerSpeed(i, game.speedX[i] * 0.985, game.speedY[i] * 0.985);
    anyBallMoving = Math.abs(game.speedX[i]) > 0.2 || Math.abs(game.speedY[i]) > 0.2 || anyBallMoving;
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
