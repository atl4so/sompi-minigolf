import { useT } from 'talkr';
import Button from '~/components/Button';
import { LobbyType } from '~/types';
import styles from './GameModeCard.module.scss';

interface GameModeCardProps {
  lobbyType: LobbyType;
}

function GameModeCard({ lobbyType }: GameModeCardProps) {
  const { T } = useT();
  const href = lobbyType === 'single' ? '/game/1' : `/lobby/${lobbyType}`;

  const lobbyName = ((): string => {
    switch (lobbyType) {
      case 'single':
        return T('LobbySelect_SinglePlayer');
      case 'dual':
        return T('LobbySelect_DualPlayer');
      case 'multi':
        return T('LobbySelect_MultiPlayer');
    }
  })();

  return (
    <div className={styles['game-mode-card']}>
      <h1>{lobbyName}</h1>
      <Button href={href}>{lobbyName}</Button>
    </div>
  );
}

export default GameModeCard;
