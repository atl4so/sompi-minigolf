import { useEffect, useRef, useState } from 'react';
import styles from './ClassicJavaClient.module.scss';

interface CheerpJOptions {
  version?: number;
  status?: 'splash' | 'none' | 'default';
  javaProperties?: string[];
  natives?: Record<string, (...args: any[]) => unknown>;
}

declare global {
  interface Window {
    cheerpjInit?: (options?: CheerpJOptions) => Promise<void>;
    cheerpjCreateDisplay?: (width: number, height: number, parent?: HTMLElement) => HTMLElement;
    cheerpjRunMain?: (className: string, classPath: string, ...args: string[]) => Promise<number>;
    __classicMinigolfSockets?: Map<number, BrowserSocketState>;
  }
}

interface BrowserSocketState {
  socket: WebSocket;
  queue: string[];
  open: boolean;
  closed: boolean;
}

const CHEERPJ_LOADER_URL = 'https://cjrtnc.leaningtech.com/4.3/loader.js';
const CLIENT_JAR_PATH = '/app/classic/playforia-minigolf-client.jar';
const CLASSIC_WIDTH = 735;
const CLASSIC_HEIGHT = 525;

function viewportSize() {
  return {
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  };
}

function classicScale() {
  const { width, height } = viewportSize();
  return Math.max(0.2, Math.min(width / CLASSIC_WIDTH, height / CLASSIC_HEIGHT));
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existingScript) {
      if (window.cheerpjInit) {
        resolve();
      } else {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function waitForCheerpJLoader() {
  return new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 15000;
    const check = () => {
      if (window.cheerpjInit) {
        resolve();
        return;
      }

      if (Date.now() > deadline) {
        reject(new Error('CheerpJ runtime did not initialize'));
        return;
      }

      window.setTimeout(check, 100);
    };

    check();
  });
}

function classicWebSocketUrl() {
  const explicitSocketUrl = import.meta.env.VITE_WS_URL;
  const baseUrl = explicitSocketUrl || window.location.origin;
  const url = new URL('/classic-ws', baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function socketMap() {
  if (!window.__classicMinigolfSockets) {
    window.__classicMinigolfSockets = new Map();
  }
  return window.__classicMinigolfSockets;
}

function createNativeBridge() {
  const sockets = socketMap();

  return {
    Java_com_aapeli_connection_BrowserWebSocket_nativeOpen(_lib: unknown, id: number, url: string) {
      const socket = new WebSocket(String(url));
      const state: BrowserSocketState = { socket, queue: [], open: false, closed: false };
      sockets.set(id, state);

      socket.addEventListener('open', () => {
        state.open = true;
      });

      socket.addEventListener('message', (event) => {
        state.queue.push(String(event.data));
      });

      socket.addEventListener('close', () => {
        state.closed = true;
        state.open = false;
        sockets.delete(id);
      });

      socket.addEventListener('error', () => {
        state.closed = true;
        state.open = false;
        sockets.delete(id);
      });
    },

    Java_com_aapeli_connection_BrowserWebSocket_nativeIsOpen(_lib: unknown, id: number) {
      const state = sockets.get(id);
      return Boolean(state?.open && state.socket.readyState === WebSocket.OPEN);
    },

    Java_com_aapeli_connection_BrowserWebSocket_nativeIsClosed(_lib: unknown, id: number) {
      const state = sockets.get(id);
      return !state || state.closed || state.socket.readyState === WebSocket.CLOSED;
    },

    Java_com_aapeli_connection_BrowserWebSocket_nativeReadLine(_lib: unknown, id: number) {
      const state = sockets.get(id);
      return state?.queue.shift() ?? null;
    },

    Java_com_aapeli_connection_BrowserWebSocket_nativeSend(_lib: unknown, id: number, line: string) {
      const state = sockets.get(id);
      if (!state || state.socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      state.socket.send(String(line));
      return true;
    },

    Java_com_aapeli_connection_BrowserWebSocket_nativeClose(_lib: unknown, id: number) {
      const state = sockets.get(id);
      sockets.delete(id);
      if (state) {
        state.closed = true;
        state.open = false;
        state.socket.close();
      }
    },
  };
}

function ClassicJavaClient() {
  const displayRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState('Loading Minigolf...');
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(classicScale);

  useEffect(() => {
    const updateScale = () => setScale(classicScale());

    window.addEventListener('resize', updateScale);
    window.visualViewport?.addEventListener('resize', updateScale);
    updateScale();

    return () => {
      window.removeEventListener('resize', updateScale);
      window.visualViewport?.removeEventListener('resize', updateScale);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startClassicClient() {
      try {
        await loadScript(CHEERPJ_LOADER_URL);
        await waitForCheerpJLoader();

        const display = displayRef.current;
        if (!display || cancelled) {
          return;
        }

        const wsUrl = classicWebSocketUrl();
        const initCheerpJ = window.cheerpjInit;
        if (!initCheerpJ) {
          throw new Error('CheerpJ runtime did not initialize');
        }

        setStatus('Loading Minigolf...');
        await initCheerpJ({
          version: 17,
          status: 'none',
          javaProperties: [
            `minigolf.wsUrl=${wsUrl}`,
            'minigolf.streamMode=true',
            `minigolf.frameWidth=${CLASSIC_WIDTH}`,
            `minigolf.frameHeight=${CLASSIC_HEIGHT}`,
          ],
          natives: createNativeBridge(),
        });
        if (!window.cheerpjCreateDisplay || !window.cheerpjRunMain) {
          throw new Error('CheerpJ application API did not initialize');
        }

        if (cancelled) {
          return;
        }

        display.replaceChildren();
        window.cheerpjCreateDisplay(CLASSIC_WIDTH, CLASSIC_HEIGHT, display);
        setStatus('');
        await window.cheerpjRunMain('org.moparforia.client.Launcher', CLIENT_JAR_PATH, '-ip', 'browser', '-p', '1', '-l', 'en');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Classic Java client failed to start');
        }
      }
    }

    void startClassicClient();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div
          ref={displayRef}
          className={styles.display}
          style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
        />
        {status ? <div className={styles.status}>{status}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}
      </div>
    </div>
  );
}

export default ClassicJavaClient;
