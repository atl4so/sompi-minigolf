import { log } from '~/utils/logger';
import { doStroke, isMouseInsideBall } from './physics';
import { drawAimLine } from './renderer';

export function mouseEventToPos(evt: MouseEvent): [number, number] {
  game.canvasRect = game.cursorCanvas.getBoundingClientRect();
  return [
    ((evt.clientX - game.canvasRect.left) * game.cursorCanvas.width) / game.canvasRect.width,
    ((evt.clientY - game.canvasRect.top) * game.cursorCanvas.height) / game.canvasRect.height,
  ];
}

export function onMouseMove(evt: MouseEvent): void {
  if (game.gameBusy) {
    return;
  }

  const pos = mouseEventToPos(evt);
  globalThis.game.mouseX = pos[0];
  globalThis.game.mouseY = pos[1];
  drawAimLine();
}

export function onMouseDown(evt: MouseEvent): void {
  if (game.currentPlayerId !== game.localPlayerId) {
    return;
  }

  const pos = mouseEventToPos(evt);
  globalThis.game.mouseX = pos[0];
  globalThis.game.mouseY = pos[1];

  if ([1, 2].includes(evt.button)) {
    if (game.shootingMode < 3) {
      globalThis.game.shootingMode += 1;
    } else {
      globalThis.game.shootingMode = 0;
    }

    drawAimLine();
    log.debug('Switched shooting mode to', game.shootingMode);
    return;
  }

  if (isMouseInsideBall(game.currentPlayerId)) {
    return;
  }

  doStroke(game.currentPlayerId);
}
