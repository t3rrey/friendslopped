import { useState } from 'react';
import { browse, useNet } from './net.ts';
import { mountScene } from './scene.ts';
import { sfx } from './sfx.ts';
import { Title } from './screens/Title.tsx';
import { GameSelect } from './screens/GameSelect.tsx';
import { LobbyBrowser } from './screens/LobbyBrowser.tsx';
import { LobbyRoom } from './screens/LobbyRoom.tsx';
import { CLIENT_GAMES } from './games.tsx';

// Stable ref callback: mounts the 3D scene once and returns its cleanup.
const sceneRef = (el: HTMLDivElement | null) => (el ? mountScene(el) : undefined);

export function App() {
  const status = useNet((s) => s.status);
  const me = useNet((s) => s.me);
  const lobby = useNet((s) => s.lobby);
  const gameId = useNet((s) => s.browsing);
  const activeGame = lobby ? lobby.gameId : gameId;
  const theme = (activeGame && CLIENT_GAMES[activeGame]?.theme) || 'n64';

  let screen;
  if (!me) screen = <Title />;
  else if (lobby?.game) {
    const Game = CLIENT_GAMES[lobby.gameId]?.Game;
    screen = Game ? <Game lobby={lobby} /> : <p>Unknown game.</p>;
  } else if (lobby) {
    const Lobby = CLIENT_GAMES[lobby.gameId]?.Lobby ?? LobbyRoom;
    screen = <Lobby lobby={lobby} />;
  } else if (gameId) screen = <LobbyBrowser gameId={gameId} onBack={() => browse(null)} />;
  else screen = <GameSelect onPick={browse} />;

  return (
    <div className={`theme-${theme}`}>
      <div className="scene" ref={sceneRef} />
      <div className="crt" aria-hidden />
      <main className="app">{screen}</main>
      {me && status === 'reconnecting' && <div className="netbar">Reconnecting…</div>}
      <Toast />
      <MuteButton />
    </div>
  );
}

function Toast() {
  const toast = useNet((s) => s.toast);
  if (!toast) return null;
  return (
    <div key={toast.id} className={`toast toast-${toast.tone}`} role="status">
      {toast.text}
    </div>
  );
}

function MuteButton() {
  const [muted, setMuted] = useState(sfx.muted);
  return (
    <button type="button" className="mute" aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(sfx.toggleMute())}>
      {muted ? '♪̸' : '♪'}
    </button>
  );
}
