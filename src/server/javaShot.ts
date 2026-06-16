import { execFile, spawn } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { resolve } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const engineRoot = resolve(process.cwd(), 'java-engine');
const sourceRoot = resolve(engineRoot, 'src/main/java');
const classesRoot = resolve(engineRoot, 'build/classes');
const cliClassFile = resolve(classesRoot, 'agolf/game/ShotEngineCli.class');

let buildPromise: Promise<void> | null = null;

function collectJavaSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return collectJavaSources(fullPath);
    }
    return entry.isFile() && entry.name.endsWith('.java') && entry.name !== 'ShotEngineModule.java' ? [fullPath] : [];
  });
}

function latestSourceMtime(sources: string[]): number {
  return Math.max(...sources.map((source) => statSync(source).mtimeMs));
}

async function ensureJavaEngineBuilt(): Promise<void> {
  const sources = collectJavaSources(sourceRoot);
  const needsBuild = !existsSync(cliClassFile) || statSync(cliClassFile).mtimeMs < latestSourceMtime(sources);
  if (!needsBuild) {
    return;
  }

  mkdirSync(classesRoot, { recursive: true });
  await execFileAsync('javac', ['-d', classesRoot, ...sources], {
    maxBuffer: 1024 * 1024,
  });
}

async function ensureJavaEngineBuiltOnce(): Promise<void> {
  if (!buildPromise) {
    buildPromise = ensureJavaEngineBuilt().finally(() => {
      buildPromise = null;
    });
  }
  return buildPromise;
}

function toInputLines(request: Record<string, unknown>): string {
  return Object.entries(request)
    .map(([key, value]) => `${key}=${String(value ?? '')}`)
    .join('\n');
}

export async function simulateJavaShot(request: Record<string, unknown>): Promise<unknown> {
  await ensureJavaEngineBuiltOnce();

  return new Promise((resolvePromise, reject) => {
    const child = spawn('java', ['-cp', classesRoot, 'agolf.game.ShotEngineCli'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Java shot engine exited with ${code}`));
        return;
      }

      try {
        resolvePromise(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(toInputLines(request));
  });
}
