import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '~/components/Button';
import GameCanvas from '~/components/GameCanvas';
import LobbyNavigation from '~/components/LobbyNavigation';
import Stack from '~/components/Stack';
import TextInput from '~/components/TextInput';
import type { Game } from '~/game';
import type { StrokeInput } from '~/game/physics';
import { socket } from '~/socket';
import { RoomResponse, RoomState } from '~/types';
import styles from './MultiplayerLobby.module.scss';

function MultiplayerLobby() {
  const [username, setUsername] = useState(() => localStorage.getItem('minigolf.username') || 'vyte');
  const [roomCode, setRoomCode] = useState('');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gameRef = useRef<Game | null>(null);
  const consumedPendingAction = useRef(false);

  useEffect(() => {
    socket.emit('joinLobby', 'multi');
    socket.emit('setUsername', username);
  }, [username]);

  useEffect(() => {
    const onRoomState = (nextRoom: RoomState) => setRoom(nextRoom);
    const onGameStarted = (nextRoom: RoomState) => setRoom(nextRoom);
    const onStrokeTaken = (stroke: StrokeInput) => gameRef.current?.applyStroke(stroke);
    const onTurnChanged = (playerId: number) => {
      gameRef.current?.setCurrentPlayer(playerId);
      setRoom((currentRoom) => (currentRoom ? { ...currentRoom, currentPlayerId: playerId } : currentRoom));
    };

    socket.on('roomState', onRoomState);
    socket.on('gameStarted', onGameStarted);
    socket.on('strokeTaken', onStrokeTaken);
    socket.on('turnChanged', onTurnChanged);

    return () => {
      socket.off('roomState', onRoomState);
      socket.off('gameStarted', onGameStarted);
      socket.off('strokeTaken', onStrokeTaken);
      socket.off('turnChanged', onTurnChanged);
      socket.emit('leaveRoom');
    };
  }, []);

  const handleRoomResponse = useCallback((response: RoomResponse) => {
    if (!response.ok || !response.room) {
      setError(response.error || 'Room action failed');
      return;
    }

    setError(null);
    setRoom(response.room);
  }, []);

  const saveUsername = useCallback(
    (nextUsername = username) => {
      const cleanUsername = nextUsername.trim() || 'Player';
      localStorage.setItem('minigolf.username', cleanUsername);
      socket.emit('setUsername', cleanUsername);
      setUsername(cleanUsername);
      return cleanUsername;
    },
    [username],
  );

  const createRoom = useCallback(() => {
    const cleanUsername = saveUsername();
    socket.emit('createRoom', cleanUsername, handleRoomResponse);
  }, [handleRoomResponse, saveUsername]);

  const joinRoom = useCallback(() => {
    const cleanUsername = saveUsername();
    socket.emit('joinRoom', roomCode, cleanUsername, handleRoomResponse);
  }, [handleRoomResponse, roomCode, saveUsername]);

  const startGame = useCallback(() => {
    socket.emit('startRoomGame', handleRoomResponse);
  }, [handleRoomResponse]);

  const leaveRoom = useCallback(() => {
    socket.emit('leaveRoom');
    setRoom(null);
  }, []);

  useEffect(() => {
    if (consumedPendingAction.current) {
      return;
    }

    const rawPendingAction = sessionStorage.getItem('minigolf.pendingRoomAction');
    if (!rawPendingAction) {
      return;
    }

    consumedPendingAction.current = true;
    sessionStorage.removeItem('minigolf.pendingRoomAction');

    try {
      const pendingAction = JSON.parse(rawPendingAction) as { action?: 'create' | 'join'; roomCode?: string };
      if (pendingAction.action === 'create') {
        createRoom();
        return;
      }

      if (pendingAction.action === 'join' && pendingAction.roomCode) {
        const cleanUsername = saveUsername();
        const cleanRoomCode = pendingAction.roomCode.trim().toUpperCase();
        setRoomCode(cleanRoomCode);
        socket.emit('joinRoom', cleanRoomCode, cleanUsername, handleRoomResponse);
      }
    } catch {
      setError('Could not open room action');
    }
  }, [createRoom, handleRoomResponse, saveUsername]);

  const localPlayer = room?.players.find((player) => player.id === socket.id);
  const currentPlayer = room?.players.find((player) => player.playerId === room.currentPlayerId);
  const isHost = room?.hostId === socket.id;

  if (room?.status === 'playing' && localPlayer) {
    return (
      <div className={styles.gameRoom}>
        <div className={styles.topBar}>
          <span>Room {room.id}</span>
          <span>{room.trackName}</span>
          <span>Turn: {currentPlayer?.name || 'Player'}</span>
        </div>
        <GameCanvas
          playerCount={room.players.length}
          localPlayerId={localPlayer.playerId}
          currentPlayerId={room.currentPlayerId}
          trackName={room.trackName}
          onReady={(game) => {
            gameRef.current = game;
          }}
          onLocalStroke={(stroke) => socket.emit('takeStroke', stroke)}
          onTurnComplete={() => socket.emit('turnComplete')}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <img src="/assets/sprites/bg-lobby-multi.gif" />
      <div className={styles.panel}>
        <div className={styles.title}>Multiplayer Room</div>

        <label className={styles.field}>
          <span>Name</span>
          <TextInput value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>

        {room ? (
          <>
            <div className={styles.roomCode}>Room {room.id}</div>
            <div className={styles.players}>
              {room.players.map((player) => (
                <div key={player.id}>
                  {player.playerId + 1}. {player.name}
                  {player.id === room.hostId ? ' (host)' : ''}
                </div>
              ))}
            </div>
            {error ? <div className={styles.error}>{error}</div> : null}
            <Stack direction="row" gap="7px">
              {isHost ? (
                <Button variant="blue" size="small" onClick={startGame}>
                  Start
                </Button>
              ) : null}
              <Button variant="red" size="small" onClick={leaveRoom}>
                Leave
              </Button>
            </Stack>
          </>
        ) : (
          <>
            <Button variant="blue" size="small" onClick={createRoom}>
              Create room
            </Button>
            <label className={styles.field}>
              <span>Room code</span>
              <TextInput
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    joinRoom();
                  }
                }}
              />
            </label>
            <Button variant="yellow" size="small" onClick={joinRoom}>
              Join room
            </Button>
            {error ? <div className={styles.error}>{error}</div> : null}
          </>
        )}
      </div>
      <Stack direction="row" justifyContent="flex-end">
        <LobbyNavigation lobbyType="multi" />
      </Stack>
    </div>
  );
}

export default MultiplayerLobby;
