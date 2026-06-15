import { useEffect, useRef } from 'react';
import { Game, startGame } from '~/game';
import type { StrokeInput } from '~/game/physics';
import GameCanvasLayer from './CanvasLayer';
import './styles.scss';

interface GameCanvasProps {
  playerCount?: number;
  localPlayerId?: number;
  trackName?: string;
  currentPlayerId?: number;
  onLocalStroke?: (stroke: StrokeInput) => void;
  onTurnComplete?: () => void;
  onReady?: (game: Game) => void;
}

function GameCanvas({
  playerCount,
  localPlayerId,
  trackName,
  currentPlayerId,
  onLocalStroke,
  onTurnComplete,
  onReady,
}: GameCanvasProps) {
  const gameRef = useRef<Game>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (gameRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const cursorCanvas = cursorCanvasRef.current;

    if (!canvas || !cursorCanvas) {
      return;
    }

    startGame(canvas, cursorCanvas, {
      playerCount,
      localPlayerId,
      trackName,
      onLocalStroke,
      onTurnComplete,
    }).then((game) => {
      gameRef.current = game;
      onReady?.(game);
    });
  }, [canvasRef, cursorCanvasRef, localPlayerId, onLocalStroke, onReady, onTurnComplete, playerCount, trackName]);

  useEffect(() => {
    if (currentPlayerId !== undefined) {
      gameRef.current?.setCurrentPlayer(currentPlayerId);
    }
  }, [currentPlayerId]);

  useEffect(() => {
    if (localPlayerId !== undefined) {
      gameRef.current?.setLocalPlayer(localPlayerId);
    }
  }, [localPlayerId]);

  useEffect(() => {
    return () => gameRef.current?.cleanUp();
  }, []);

  return (
    <div className="game-canvas-wrap">
      <GameCanvasLayer ref={canvasRef} />
      <GameCanvasLayer ref={cursorCanvasRef} />
    </div>
  );
}

export default GameCanvas;
