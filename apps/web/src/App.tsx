import { useState } from 'react';
import { useNet } from './net.ts';
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
  const [gameId, setGameId] = useState<string | null>(null);

  let screen;
  if (!me) screen = <Title />;
  else if (lobby?.game) {
    const Game = CLIENT_GAMES[lobby.gameId]?.Game;
    screen = Game ? <Game lobby={lobby} /> : <p>Unknown game.</p>;
  } else if (lobby) screen = <LobbyRoom lobby={lobby} />;
  else if (gameId) screen = <LobbyBrowser gameId={gameId} onBack={() => setGameId(null)} />;
  else screen = <GameSelect onPick={setGameId} />;

  return (
    <>
      <div className="scene" ref={sceneRef} />
      <div className="crt" aria-hidden />
      <main className="app">{screen}</main>
      {me && status === 'reconnecting' && <div className="netbar">Reconnecting…</div>}
      <Toast />
      <MuteButton />
    </>
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
