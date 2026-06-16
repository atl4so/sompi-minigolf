import { useCallback, useRef, useState } from 'react';
import GameCanvas from '~/components/GameCanvas';
import MatchHud from '~/components/MatchHud';
import type { Game } from '~/game';
import type { StrokeInput } from '~/game/physics';
import { getNextActivePlayer, getWinnerPlayerIds, makeMatchTracks, makePlayerRows, MAX_STROKES } from '~/game/session';
import styles from './LocalMatchLobby.module.scss';

interface LocalMatchLobbyProps {
  playerNames: string[];
}

interface LocalMatchState {
  trackIndex: number;
  currentPlayerId: number;
  currentStrokes: number[];
  scores: number[][];
  holed: boolean[];
  winnerPlayerIds: number[];
}

function createInitialState(playerCount: number): LocalMatchState {
  return {
    trackIndex: 0,
    currentPlayerId: 0,
    currentStrokes: makePlayerRows(playerCount, 0),
    scores: Array.from({ length: playerCount }, () => []),
    holed: makePlayerRows(playerCount, false),
    winnerPlayerIds: [],
  };
}

function LocalMatchLobby({ playerNames }: LocalMatchLobbyProps) {
  const trackNames = makeMatchTracks();
  const playerCount = playerNames.length;
  const gameRef = useRef<Game | null>(null);
  const [state, setState] = useState(() => createInitialState(playerCount));
  const trackName = trackNames[state.trackIndex];
  const finished = state.winnerPlayerIds.length > 0;

  const handleLocalStroke = useCallback((stroke: StrokeInput) => {
    setState((current) => {
      if (finished || stroke.playerId !== current.currentPlayerId || current.holed[stroke.playerId]) {
        return current;
      }

      const currentStrokes = current.currentStrokes.slice();
      currentStrokes[stroke.playerId] += 1;
      return {
        ...current,
        currentStrokes,
      };
    });
  }, [finished]);

  const handleTurnComplete = useCallback(() => {
    setState((current) => {
      if (current.winnerPlayerIds.length > 0) {
        return current;
      }

      const playerId = current.currentPlayerId;
      const holed = current.holed.slice();
      holed[playerId] = Boolean(gameRef.current?.getOnHole(playerId)) || current.currentStrokes[playerId] >= MAX_STROKES;

      if (!holed.every(Boolean)) {
        return {
          ...current,
          holed,
          currentPlayerId: getNextActivePlayer(playerId, holed),
        };
      }

      const scores = current.scores.map((playerScores, scorePlayerId) => [
        ...playerScores,
        current.currentStrokes[scorePlayerId] || MAX_STROKES + 1,
      ]);
      const nextTrackIndex = current.trackIndex + 1;
      if (nextTrackIndex >= trackNames.length) {
        return {
          ...current,
          holed,
          scores,
          winnerPlayerIds: getWinnerPlayerIds(scores),
        };
      }

      return {
        trackIndex: nextTrackIndex,
        currentPlayerId: nextTrackIndex % playerCount,
        currentStrokes: makePlayerRows(playerCount, 0),
        scores,
        holed: makePlayerRows(playerCount, false),
        winnerPlayerIds: [],
      };
    });
  }, [playerCount, trackNames.length]);

  return (
    <div className={styles.match}>
      <GameCanvas
        key={`${state.trackIndex}-${trackName}`}
        playerCount={playerCount}
        localPlayerId={state.currentPlayerId}
        currentPlayerId={state.currentPlayerId}
        trackName={trackName}
        onReady={(game) => {
          gameRef.current = game;
        }}
        onLocalStroke={handleLocalStroke}
        onTurnComplete={handleTurnComplete}
      />
      <MatchHud
        playerNames={playerNames}
        trackNames={trackNames}
        trackIndex={state.trackIndex}
        trackName={trackName}
        currentPlayerId={state.currentPlayerId}
        currentStrokes={state.currentStrokes}
        scores={state.scores}
        holed={state.holed}
        maxStrokes={MAX_STROKES}
        winnerPlayerIds={state.winnerPlayerIds}
      />
      {finished ? <div className={styles.status}>Game finished. Winner: {state.winnerPlayerIds.map((id) => playerNames[id]).join(', ')}</div> : null}
    </div>
  );
}

export default LocalMatchLobby;
