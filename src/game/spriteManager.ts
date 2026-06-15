import { log } from '~/utils/logger';

interface Sprite {
  data: ImageData;
  mask: number[][];
  height: number;
  width: number;
  draw(ctx: CanvasRenderingContext2D, x: number, y: number): void;
}

interface SpriteManager {
  [sheetName: string]: Sprite[];
}

function createPixelMask(spriteData: ImageData, spriteWidth: number, spriteHeight: number): number[][] {
  const mask = Array.from({ length: spriteWidth }, () => new Array<number>(spriteHeight));

  for (let y = 0; y < spriteHeight; y++) {
    for (let x = 0; x < spriteWidth; x++) {
      const index = (y * spriteWidth + x) * 4;
      const rgb = (spriteData.data[index] << 16) | (spriteData.data[index + 1] << 8) | spriteData.data[index + 2];
      mask[x][y] = rgb === 0xccccff ? 1 : 2;
    }
  }

  return mask;
}

function createSprite(spriteData: ImageData, spriteWidth: number, spriteHeight: number): Sprite {
  return {
    data: spriteData,
    mask: createPixelMask(spriteData, spriteWidth, spriteHeight),
    width: spriteWidth,
    height: spriteHeight,
    draw: (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      ctx.putImageData(spriteData, x, y);
    },
  };
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', reject);
    image.src = src;
  });
}

type LoadSpritesheetsInput = [
  sheetName: string,
  spriteCount: number,
  spritesPerColumn: number,
  spriteWidth: number,
  spriteHeight: number,
];

export const spriteManager: SpriteManager = {};

export function getPixelMask(isSpecial: number, shapeOrSpecialIndex: number): number[][] | undefined {
  if (isSpecial === 1) {
    return spriteManager.shapes?.[shapeOrSpecialIndex]?.mask;
  }

  if (isSpecial === 2) {
    return spriteManager.special?.[shapeOrSpecialIndex]?.mask;
  }

  return undefined;
}

export async function loadSpritesheets(
  ctx: CanvasRenderingContext2D,
  spritesheets: LoadSpritesheetsInput[],
): Promise<Record<string, Sprite[]>> {
  for (const [sheetName, spriteCount, spritesPerColumn, spriteWidth, spriteHeight] of spritesheets) {
    if (sheetName in spriteManager) {
      continue;
    }
    const imageUrl = `/assets/sprites/${sheetName}.gif`;
    const sheetImage = await loadImage(imageUrl);

    log.debug(`Loading spritesheet from URL: "${imageUrl}"`);

    try {
      spriteManager[sheetName] = new Array(spriteCount);
      const sheetWidth = sheetImage.width;
      const sheetHeight = sheetImage.height;
      ctx.drawImage(sheetImage, 0, 0);

      for (let index = 0; index < spriteCount; index++) {
        const sheetRow = Math.floor(index / spritesPerColumn);
        const sheetColumn = index % spritesPerColumn;
        const sheetX = sheetColumn * spriteHeight + sheetColumn + 1;
        const sheetY = sheetRow * spriteWidth + sheetRow + 1;

        spriteManager[sheetName][index] = createSprite(
          ctx.getImageData(sheetX, sheetY, spriteWidth, spriteHeight),
          spriteWidth,
          spriteHeight,
        );
      }
      ctx.clearRect(0, 0, sheetWidth, sheetHeight);
    } catch (e: any) {
      log.error(`Failed to load spritesheet from URL "${imageUrl}".`, e.message);
    }
  }
  return spriteManager;
}
