import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from 'talkr';
import { useLocation } from 'wouter';
import Button from '~/components/Button';
import LobbyCard from '~/components/GameModeCard';
import TextInput from '~/components/TextInput';
import styles from './LobbySelect.module.scss';

export function LobbySelect() {
  const { T } = useT();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState(() => localStorage.getItem('minigolf.username') || '');
  const [roomCode, setRoomCode] = useState('');

  const saveUsername = () => {
    const cleanUsername = username.trim() || 'Player';
    localStorage.setItem('minigolf.username', cleanUsername);
    setUsername(cleanUsername);
    return cleanUsername;
  };

  const openMultiplayer = (action: 'create' | 'join') => {
    saveUsername();
    sessionStorage.setItem(
      'minigolf.pendingRoomAction',
      JSON.stringify({
        action,
        roomCode: roomCode.trim().toUpperCase(),
      }),
    );
    setLocation('/lobby/multi');
  };

  const renderRoomControls = (large = false) => (
    <>
      <label className={large ? styles['mobile-field'] : styles.field}>
        <span>Name</span>
        <TextInput
          value={username}
          placeholder="Player"
          maxLength={18}
          autoComplete="nickname"
          large={large}
          onChange={(event) => {
            setUsername(event.target.value);
            localStorage.setItem('minigolf.username', event.target.value);
          }}
        />
      </label>
      <label className={large ? styles['mobile-field'] : styles.field}>
        <span>Room</span>
        <TextInput
          value={roomCode}
          placeholder="CODE"
          maxLength={5}
          autoComplete="off"
          large={large}
          onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && roomCode.trim()) {
              openMultiplayer('join');
            }
          }}
        />
      </label>
      <div className={large ? styles['mobile-actions'] : styles.actions}>
        <Button
          variant="blue"
          size="small"
          style={large ? { width: '150px', height: '38px', fontSize: '14px' } : undefined}
          onClick={() => openMultiplayer('create')}
        >
          Create room
        </Button>
        <Button
          variant="yellow"
          size="small"
          style={large ? { width: '150px', height: '38px', fontSize: '14px' } : undefined}
          disabled={!roomCode.trim()}
          onClick={() => openMultiplayer('join')}
        >
          Join room
        </Button>
      </div>
    </>
  );

  return (
    <>
      <div className={styles.container}>
        <img src="assets/sprites/bg-lobbyselect.gif" />
        <div className={styles['card-container']}>
          <LobbyCard lobbyType="single" />
          <LobbyCard lobbyType="dual" />
          <LobbyCard lobbyType="multi" />
        </div>
        <Button className={styles['quick-start-button']} variant="blue" size="small" href="/game/1">
          {T('LobbySelect_QuickStart')}
        </Button>
        <div className={styles['room-panel']}>{renderRoomControls()}</div>
      </div>
      {createPortal(
        <div className={styles['mobile-room-sheet']}>
          <div className={styles['mobile-title']}>Play With Friends</div>
          {renderRoomControls(true)}
        </div>,
        document.body,
      )}
    </>
  );
}
