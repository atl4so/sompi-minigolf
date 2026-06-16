export const MATCH_TRACK_COUNT = 9;
export const MAX_STROKES = 12;

export const MATCH_TRACKS = [
  'BasicElements',
  'Aquaria',
  'BasementReflex',
  'ColourMeYellow',
  'Cube',
  'Darwin',
  'WildWest',
  'Balrows',
  'Conveyor',
];

export function makeMatchTracks(): string[] {
  return MATCH_TRACKS.slice(0, MATCH_TRACK_COUNT);
}

export function makePlayerRows<T>(playerCount: number, value: T): T[] {
  return Array.from({ length: playerCount }, () => value);
}

export function getNextActivePlayer(currentPlayerId: number, holed: boolean[]): number {
  for (let offset = 1; offset <= holed.length; offset++) {
    const candidate = (currentPlayerId + offset) % holed.length;
    if (!holed[candidate]) {
      return candidate;
    }
  }

  return currentPlayerId;
}

export function getWinnerPlayerIds(scores: number[][]): number[] {
  const totals = scores.map((playerScores) => playerScores.reduce((sum, score) => sum + score, 0));
  const best = Math.min(...totals);
  return totals.map((score, playerId) => (score === best ? playerId : -1)).filter((playerId) => playerId >= 0);
}
