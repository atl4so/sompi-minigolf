import { log } from '~/utils/logger';
import { preloadJavaShotEngine } from './javaEngine';
import { onMouseDown, onMouseMove } from './input';
import { decompressMap } from './mapParser';
import { drawAimLine, drawBalls, initializeMapState, renderMap } from './renderer';
import { resetPlayerPosition } from './physics';
import { GameSeed } from './seed';
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
    collisionMap: null,
    startPositionX: -1,
    startPositionY: -1,
    resetPositionX: [-1, -1, -1, -1],
    resetPositionY: [-1, -1, -1, -1],
    teleportStarts: [[], [], [], []],
    teleportExits: [[], [], [], []],
    magnetMap: null,
    waterMode: 0,
    collisionMode: 1,
    onHoleSync: [],
    shotState: null,
    seed: new GameSeed(0),
    bounciness: 1,
    magnetSpeed: 1,
    animationFrameId: null,
    onLocalStroke: options.onLocalStroke,
    onTurnComplete: options.onTurnComplete,
  };
  preloadJavaShotEngine();

  const loadTrack = async (mapName: string, playerCount = options.playerCount ?? 1) => {
    log.debug(`Loading track "${mapName}""`);

    // Fetch map
    const res = await fetch(`/assets/tracks/${mapName}.track`);
    const trackStr = await res.text();
    const track = parseTrack(trackStr);
    const map = decompressMap(track.mapData);
    globalThis.game.currentMap = map;

    // Render map
    renderMap(map);
    const mapState = initializeMapState(map, 0);
    game.playerCount = playerCount;
    game.playerX = [];
    game.playerY = [];
    game.speedX = [];
    game.speedY = [];
    game.startPositionX = mapState.startPositionX;
    game.startPositionY = mapState.startPositionY;
    game.resetPositionX = mapState.resetPositionX;
    game.resetPositionY = mapState.resetPositionY;
    game.teleportStarts = mapState.teleportStarts;
    game.teleportExits = mapState.teleportExits;
    game.magnetMap = mapState.magnetMap;
    game.onHoleSync = [];
    game.shotState = null;
    game.seed = new GameSeed(0);
    for (let playerId = 0; playerId < playerCount; playerId++) {
      game.playerX[playerId] = 0;
      game.playerY[playerId] = 0;
      game.speedX[playerId] = 0;
      game.speedY[playerId] = 0;
      game.onHoleSync[playerId] = false;
      resetPlayerPosition(playerId);
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
