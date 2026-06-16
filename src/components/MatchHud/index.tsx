import styles from './MatchHud.module.scss';

interface MatchHudProps {
  playerNames: string[];
  trackNames: string[];
  trackIndex: number;
  trackName: string;
  currentPlayerId: number;
  currentStrokes: number[];
  scores: number[][];
  holed: boolean[];
  maxStrokes: number;
  winnerPlayerIds?: number[];
}

function playerTotal(scores: number[], currentStrokes: number, finished: boolean) {
  const savedTotal = scores.reduce((sum, score) => sum + score, 0);
  return savedTotal + (finished ? 0 : currentStrokes);
}

function MatchHud({
  playerNames,
  trackNames,
  trackIndex,
  trackName,
  currentPlayerId,
  currentStrokes,
  scores,
  holed,
  maxStrokes,
  winnerPlayerIds = [],
}: MatchHudProps) {
  const holes = trackNames.map((_, index) => index);

  return (
    <div className={styles.hud}>
      <div className={styles.summary}>
        <span>
          Map {Math.min(trackIndex + 1, trackNames.length)} / {trackNames.length}: {trackName}
        </span>
        <span>Max {maxStrokes}</span>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Player</th>
            {holes.map((hole) => (
              <th key={hole}>{hole + 1}</th>
            ))}
            <th>Now</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {playerNames.map((name, playerId) => {
            const finished = winnerPlayerIds.length > 0;
            const total = playerTotal(scores[playerId] ?? [], currentStrokes[playerId] ?? 0, finished);
            return (
              <tr
                key={playerId}
                className={[playerId === currentPlayerId && !finished ? styles.active : '', winnerPlayerIds.includes(playerId) ? styles.winner : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                <td>
                  {playerId + 1}. {name}
                  {holed[playerId] ? ' done' : ''}
                </td>
                {holes.map((hole) => (
                  <td key={hole}>{scores[playerId]?.[hole] ?? '-'}</td>
                ))}
                <td>{finished ? '-' : currentStrokes[playerId] ?? 0}</td>
                <td>{total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default MatchHud;
