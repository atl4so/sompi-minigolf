import { log } from '~/utils/logger';
import { onMouseDown, onMouseMove } from './input';
import { decompressMap } from './mapParser';
import { drawAimLine, drawBalls, renderMap } from './renderer';
import { loadSpritesheets } from './spriteManager';
import { parseTrack } from './track';
import type { StrokeInput } from './physics';

export interface Game {
  loadTrack: (mapName: string, playerCount?: number) => Promise<void>;
  setCurrentPlayer: (playerId: number) => void;
  setLocalPlayer: (playerId: number) => void;
  applyStroke: (stroke: StrokeInput) => void;
  cleanUp: () => void;
}

interface StartGameOptions {
  playerCount?: number;
  localPlayerId?: number;
  trackName?: string;
  onLocalStroke?: (stroke: StrokeInput) => void;
  onTurnComplete?: () => void;
}

function getPlayerStart(startPositions: number[][], playerId: number): [number, number] {
  const base = startPositions[playerId] ?? startPositions[0] ?? [367, 187];
  const offset = startPositions[playerId] ? 0 : playerId * 4;
  return [base[0] + offset, base[1] + offset];
}

export async function startGame(
  canvas: HTMLCanvasElement,
  cursorCanvas: HTMLCanvasElement,
  options: StartGameOptions = {},
): Promise<Game> {
  const ctx = canvas.getContext('2d');
  const cursorCtx = cursorCanvas.getContext('2d');

  if (!ctx || !cursorCtx) {
    throw new Error('Could not get canvas drawing context');
  }

  globalThis.game = {
    canvas,
    canvasRect: canvas.getBoundingClientRect(),
    cursorCanvas,
    ctx,
    cursorCtx,
    playerX: [],
    playerY: [],
    speedX: [],
    speedY: [],
    playerCount: options.playerCount ?? 1,
    localPlayerId: options.localPlayerId ?? 0,
    mouseX: -1,
    mouseY: -1,
    currentPlayerId: 0,
    shootingMode: 0,
    mod: 0,
    gameBusy: false,
    cursorImgData: cursorCtx.getImageData(0, 0, cursorCanvas.width, cursorCanvas.height),
    currentMap: null,
    animationFrameId: null,
    onLocalStroke: options.onLocalStroke,
    onTurnComplete: options.onTurnComplete,
  };

  const loadTrack = async (mapName: string, playerCount = options.playerCount ?? 1) => {
    log.debug(`Loading track "${mapName}""`);

    // Fetch map
    const res = await fetch(`/assets/tracks/${mapName}.track`);
    const trackStr = await res.text();
    const track = parseTrack(trackStr);
    const map = decompressMap(track.mapData);
    globalThis.game.currentMap = map;

    // Render map
    const { startPositions } = await renderMap(map);
    game.playerCount = playerCount;
    game.playerX = [];
    game.playerY = [];
    game.speedX = [];
    game.speedY = [];
    for (let playerId = 0; playerId < playerCount; playerId++) {
      const [x, y] = getPlayerStart(startPositions, playerId);
      game.playerX[playerId] = x;
      game.playerY[playerId] = y;
      game.speedX[playerId] = 0;
      game.speedY[playerId] = 0;
    }

    // Listen mouse events
    cursorCanvas.addEventListener('mousemove', onMouseMove);
    cursorCanvas.addEventListener('mousedown', onMouseDown);
    game.canvasRect = canvas.getBoundingClientRect();
    drawAimLine();
    drawBalls();
  };

  await loadSpritesheets(ctx, [
    ['balls', 8, 4, 13, 13],
    ['elements', 24, 4, 15, 15],
    ['shapes', 28, 4, 15, 15],
    ['special', 28, 4, 15, 15],
  ]);

  if (options.trackName) {
    await loadTrack(options.trackName, options.playerCount);
  } else {
    fetch('/assets/tracks/tracks.json')
      .then((r) => r.json())
      .then(async (tracks: string[]) => {
        const sortedTracks = tracks.sort();
        const randIndex = Math.floor(Math.random() * sortedTracks.length);
        await loadTrack(sortedTracks[randIndex], options.playerCount);
      });
  }

  return {
    loadTrack,
    setCurrentPlayer: (playerId: number) => {
      game.currentPlayerId = playerId;
      drawAimLine();
    },
    setLocalPlayer: (playerId: number) => {
      game.localPlayerId = playerId;
    },
    applyStroke: (stroke: StrokeInput) => {
      import('./physics').then(({ doStroke }) => doStroke(stroke.playerId, stroke, false));
    },
    cleanUp: () => {
      if (game.animationFrameId !== null) {
        cancelAnimationFrame(game.animationFrameId);
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cursorCtx.clearRect(0, 0, canvas.width, canvas.height);
      cursorCanvas.removeEventListener('mousedown', onMouseDown);
      cursorCanvas.removeEventListener('mousemove', onMouseMove);
    },
  };
}
