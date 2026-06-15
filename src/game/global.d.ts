interface GameShotState {
  lastResetX: number[];
  lastResetY: number[];
  lastSafeX: number[];
  lastSafeY: number[];
  previousX: number[];
  previousY: number[];
  holeTimer: number[];
  onHole: boolean[];
  onLiquidOrSwamp: boolean[];
  teleported: boolean[];
  spinningStuckCounter: number[];
  magnetStuckCounter: number[];
  downhillStuckCounter: number[];
  loopStuckCounter: number;
}

declare var game: {
  canvas: HTMLCanvasElement;
  canvasRect: DOMRect;
  ctx: CanvasRenderingContext2D;
  cursorCanvas: HTMLCanvasElement;
  cursorCtx: CanvasRenderingContext2D;
  playerX: number[];
  playerY: number[];
  speedX: number[];
  speedY: number[];
  playerCount: number;
  localPlayerId: number;
  mouseX: number;
  mouseY: number;
  currentPlayerId: number;
  shootingMode: number; // Varies from 0-4
  gameBusy: boolean;
  cursorImgData: ImageData;
  mod: 0 | 1 | 2 | 3;
  currentMap: import('./minigolfMap').MinigolfMap | null;
  collisionMap: Uint8Array | null;
  startPositionX: number;
  startPositionY: number;
  resetPositionX: number[];
  resetPositionY: number[];
  teleportStarts: number[][][];
  teleportExits: number[][][];
  magnetMap: Int16Array | null;
  waterMode: 0 | 1;
  collisionMode: 0 | 1;
  onHoleSync: boolean[];
  shotState: GameShotState | null;
  seed: import('./seed').GameSeed;
  bounciness: number;
  magnetSpeed: number;
  animationFrameId: number | null;
  onLocalStroke?: (stroke: import('./physics').StrokeInput) => void;
  onTurnComplete?: () => void;
};
