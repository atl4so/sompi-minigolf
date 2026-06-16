import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '~/components/Button';
import ChatTextField from '~/components/ChatInputs';
import ChatMessages, { ChatMessage } from '~/components/ChatMessages';
import GameCanvas from '~/components/GameCanvas';
import LobbyNavigation from '~/components/LobbyNavigation';
import MatchHud from '~/components/MatchHud';
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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    socket.emit('joinLobby', 'multi');
    socket.emit('setUsername', username);
  }, [username]);

  useEffect(() => {
    const onRoomState = (nextRoom: RoomState) => setRoom(nextRoom);
    const onGameStarted = (nextRoom: RoomState) => setRoom(nextRoom);
    const onTrackStarted = (nextRoom: RoomState) => setRoom(nextRoom);
    const onGameFinished = (nextRoom: RoomState) => setRoom(nextRoom);
    const onStrokeTaken = (stroke: StrokeInput) => gameRef.current?.applyStroke(stroke);
    const onTurnChanged = (playerId: number) => {
      gameRef.current?.setCurrentPlayer(playerId);
      setRoom((currentRoom) => (currentRoom ? { ...currentRoom, currentPlayerId: playerId } : currentRoom));
    };
    const onMessage = (text: string, from: string, isPrivate?: boolean) => {
      setChatMessages((messages) => [
        ...messages,
        {
          text,
          from,
          color: isPrivate ? '#a000a0' : '#000',
        },
      ]);
    };

    socket.on('roomState', onRoomState);
    socket.on('gameStarted', onGameStarted);
    socket.on('trackStarted', onTrackStarted);
    socket.on('gameFinished', onGameFinished);
    socket.on('strokeTaken', onStrokeTaken);
    socket.on('turnChanged', onTurnChanged);
    socket.on('message', onMessage);

    return () => {
      socket.off('roomState', onRoomState);
      socket.off('gameStarted', onGameStarted);
      socket.off('trackStarted', onTrackStarted);
      socket.off('gameFinished', onGameFinished);
      socket.off('strokeTaken', onStrokeTaken);
      socket.off('turnChanged', onTurnChanged);
      socket.off('message', onMessage);
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

  const sendChatMessage = useCallback(
    (text: string) => {
      socket.emit('sendMessage', text);
      setChatMessages((messages) => [
        ...messages,
        {
          text,
          from: username,
          color: '#0000f0',
        },
      ]);
    },
    [username],
  );

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
          key={`${room.id}-${room.trackIndex}-${room.trackName}`}
          playerCount={room.players.length}
          localPlayerId={localPlayer.playerId}
          currentPlayerId={room.currentPlayerId}
          trackName={room.trackName}
          onReady={(game) => {
            gameRef.current = game;
          }}
          onLocalStroke={(stroke) => socket.emit('takeStroke', stroke)}
          onTurnComplete={() => {
            if (room.currentPlayerId === localPlayer.playerId) {
              socket.emit('turnComplete', Boolean(gameRef.current?.getOnHole(localPlayer.playerId)));
            }
          }}
        />
        <MatchHud
          playerNames={room.players.map((player) => player.name)}
          trackNames={room.trackNames}
          trackIndex={room.trackIndex}
          trackName={room.trackName}
          currentPlayerId={room.currentPlayerId}
          currentStrokes={room.currentStrokes}
          scores={room.scores}
          holed={room.holed}
          maxStrokes={room.maxStrokes}
          winnerPlayerIds={room.winnerPlayerIds}
        />
        <div className={styles.chat}>
          <ChatMessages messages={chatMessages} />
          <ChatTextField onSend={sendChatMessage} />
        </div>
      </div>
    );
  }

  if (room?.status === 'finished') {
    return (
      <div className={styles.gameRoom}>
        <MatchHud
          playerNames={room.players.map((player) => player.name)}
          trackNames={room.trackNames}
          trackIndex={room.trackIndex}
          trackName={room.trackName}
          currentPlayerId={room.currentPlayerId}
          currentStrokes={room.currentStrokes}
          scores={room.scores}
          holed={room.holed}
          maxStrokes={room.maxStrokes}
          winnerPlayerIds={room.winnerPlayerIds}
        />
        <div className={styles.finished}>Winner: {room.winnerPlayerIds.map((playerId) => room.players[playerId]?.name).join(', ')}</div>
        <Stack direction="row" gap="7px">
          {isHost ? (
            <Button variant="blue" size="small" onClick={startGame}>
              New game
            </Button>
          ) : null}
          <Button variant="red" size="small" onClick={leaveRoom}>
            Leave
          </Button>
        </Stack>
        <div className={styles.chat}>
          <ChatMessages messages={chatMessages} />
          <ChatTextField onSend={sendChatMessage} />
        </div>
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
            <div className={styles.roomMeta}>Maps: {room.trackNames.length}</div>
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
            <div className={styles.chat}>
              <ChatMessages messages={chatMessages} />
              <ChatTextField onSend={sendChatMessage} />
            </div>
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
