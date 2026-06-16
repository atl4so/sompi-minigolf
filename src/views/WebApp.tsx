import { Route } from 'wouter';
import LanguageSelect from '../components/LanguageSelect';
import { useAssetPreloader } from '../hooks/useAssetPreloader';
import { useLocalStorageLocale } from '../hooks/useLocalStorageLocale';
import { useSocketState } from '../hooks/useSocketState';
import { LobbyType } from '../types';
import Game from './Game';
import LoadingScreen from './LoadingScreen';
import Lobby from './Lobby';
import { LobbySelect } from './LobbySelect';

function WebApp() {
  const { loadingAssets } = useAssetPreloader();
  useSocketState();

  useLocalStorageLocale();

  if (loadingAssets) {
    return <LoadingScreen />;
  }

  return (
    <>
      <LanguageSelect />
      <div className="app-container">
        <div id="game">
          <Route path="/web" component={LobbySelect} />
          <Route path="/lobby/:lobbyType">{(params) => <Lobby lobbyType={params.lobbyType as LobbyType} />}</Route>
          <Route path="/game/:gameId" component={Game} />
        </div>
      </div>
    </>
  );
}

export default WebApp;
