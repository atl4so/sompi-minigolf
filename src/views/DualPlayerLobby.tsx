import { useCallback, useState } from 'react';
import GameCanvas from '~/components/GameCanvas';

function DualPlayerLobby() {
  const [currentPlayerId, setCurrentPlayerId] = useState(0);
  const nextTurn = useCallback(() => {
    setCurrentPlayerId((playerId) => (playerId + 1) % 2);
  }, []);

  return (
    <GameCanvas
      playerCount={2}
      localPlayerId={currentPlayerId}
      currentPlayerId={currentPlayerId}
      onTurnComplete={nextTurn}
    />
  );
}

export default DualPlayerLobby;
