import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'minigolf-engine-'));

function collectJavaSources(directory) {
  return execFileSync('find', [directory, '-name', '*.java', '!', '-name', 'ShotEngineModule.java'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);
}

function makeRequest() {
  const collisionMap = Buffer.alloc(735 * 375).toString('base64');
  const mapTiles = Buffer.alloc(49 * 25 * 4).toString('base64');
  const values = {
    playerCount: '1',
    currentPlayerId: '0',
    playerId: '0',
    waterMode: '0',
    collisionMode: '1',
    startPositionX: '367.5',
    startPositionY: '187.5',
    resetPositionX: '-1',
    resetPositionY: '-1',
    teleportStarts: '|||',
    teleportExits: '|||',
    magnetMap: '',
    playerX: '367.5',
    playerY: '187.5',
    speedX: '0',
    speedY: '0',
    simulatePlayer: '1',
    onHoleSync: '0',
    playerActive: '1',
    isLocalPlayer: '1',
    seedRaw: '25214903917',
    maxPhysicsIterations: '2',
    mouseX: '520',
    mouseY: '187.5',
    shootingMode: '0',
    collisionMap,
    mapTiles,
  };

  return Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

function maxFrameDelta(left, right) {
  let delta = 0;
  for (let i = 0; i < Math.min(left.frames.length, right.frames.length); i++) {
    for (let j = 0; j < left.frames[i].length; j++) {
      delta = Math.max(delta, Math.abs(left.frames[i][j] - right.frames[i][j]));
    }
  }
  return delta;
}

try {
  const classes = join(temp, 'classes');
  const sources = collectJavaSources(join(root, 'java-engine/src/main/java'));
  execFileSync('javac', ['-d', classes, ...sources], { stdio: 'inherit' });

  const request = makeRequest();
  const jvm = spawnSync('java', ['-cp', classes, 'agolf.game.ShotEngineCli'], {
    input: request,
    encoding: 'utf8',
  });
  if (jvm.status !== 0) {
    throw new Error(jvm.stderr || `JVM engine exited with ${jvm.status}`);
  }

  const modulePath = join(temp, 'shot-engine.mjs');
  cpSync(join(root, 'src/generated/java-engine/shot-engine.js'), modulePath);
  const { simulate } = await import(pathToFileURL(modulePath));

  const jvmResult = JSON.parse(jvm.stdout);
  const jsResult = JSON.parse(simulate(request));
  const delta = maxFrameDelta(jvmResult, jsResult);
  const summary = {
    jvmFrames: jvmResult.frames.length,
    jsFrames: jsResult.frames.length,
    maxFrameDelta: delta,
    finalX: jsResult.playerX[0],
    finalY: jsResult.playerY[0],
    sameSeed: jvmResult.seedRaw === jsResult.seedRaw,
  };

  if (
    jvmResult.frames.length !== jsResult.frames.length ||
    delta > 1e-9 ||
    Math.abs(jvmResult.playerX[0] - jsResult.playerX[0]) > 1e-9 ||
    Math.abs(jvmResult.playerY[0] - jsResult.playerY[0]) > 1e-9 ||
    jvmResult.seedRaw !== jsResult.seedRaw
  ) {
    writeFileSync(join(temp, 'jvm.json'), JSON.stringify(jvmResult));
    writeFileSync(join(temp, 'js.json'), JSON.stringify(jsResult));
    console.error(JSON.stringify(summary, null, 2));
    throw new Error(`Engine parity failed; kept temp output at ${temp}`);
  }

  console.log(JSON.stringify(summary, null, 2));
  rmSync(temp, { recursive: true, force: true });
} catch (error) {
  if (!String(error?.message || error).includes('kept temp output')) {
    rmSync(temp, { recursive: true, force: true });
  }
  throw error;
}
