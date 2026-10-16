import { useState } from 'react';
import { LOBBY_NAME_MAX } from '@friendslopped/shared';
import { send, useNet } from '../net.ts';
import { Button, ChunkyText, Panel } from '../ui.tsx';

export function LobbyBrowser({ gameId, onBack }: { gameId: string; onBack: () => void }) {
  const game = useNet((s) => s.games.find((g) => g.id === gameId));
  const allLobbies = useNet((s) => s.lobbies);
  const me = useNet((s) => s.me)!;
  const lobbies = allLobbies.filter((l) => l.gameId === gameId);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [modeId, setModeId] = useState(game?.modes[0]?.id ?? '');
  const [isPrivate, setIsPrivate] = useState(false);
  if (!game) return null;

  return (
    <div className="screen">
      <header className="screen-head">
        <Button tone="z" size="sm" sound="back" onClick={onBack}>
          ◀ Back
        </Button>
        <h1 className="heading">
          <ChunkyText text={game.name} />
        </h1>
        <span />
      </header>

      <div className="browser">
        <Panel title="Open Lobbies" className="browser-list">
          {lobbies.length === 0 ? (
            <p className="empty">No public lobbies yet. Host one!</p>
          ) : (
            <ul className="lobby-list">
              {lobbies.map((l) => {
                const full = l.playerCount >= l.maxPlayers;
                const mode = game.modes.find((m) => m.id === l.modeId);
                return (
                  <li key={l.code} className="lobby-row">
                    <div>
                      <b>{l.name}</b>
                      <small>
                        Host {l.hostName} · {mode?.name} · <code>{l.code}</code>
                      </small>
                    </div>
                    <span className="count">
                      {l.playerCount}/{l.maxPlayers}
                    </span>
                    <Button
                      tone="b"
                      size="sm"
                      sound="select"
                      disabled={l.status === 'playing' || full}
                      onClick={() => send({ type: 'joinLobby', code: l.code })}
                    >
                      {l.status === 'playing' ? 'In game' : full ? 'Full' : 'Join'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <form
            className="inline-form join-code"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) send({ type: 'joinLobby', code: code.trim() });
            }}
          >
            <input
              value={code}
              maxLength={4}
              placeholder="CODE"
              aria-label="Lobby code"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <Button tone="a" type="submit" sound="select" disabled={code.trim().length !== 4}>
              Join by code
            </Button>
          </form>
        </Panel>

        <Panel title="Host a Lobby" accent="c" className="browser-create">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send({ type: 'createLobby', gameId, modeId, name: name.trim(), isPrivate });
            }}
          >
            <label className="field">
              <span>Lobby name</span>
              <input value={name} maxLength={LOBBY_NAME_MAX} placeholder={`${me.name}'s ${game.name}`} onChange={(e) => setName(e.target.value)} />
            </label>
            <fieldset className="modes">
              <legend>Game mode</legend>
              {game.modes.map((m) => (
                <label key={m.id} className={`mode ${m.id === modeId ? 'mode-on' : ''}`}>
                  <input type="radio" name="mode" checked={m.id === modeId} onChange={() => setModeId(m.id)} />
                  <b>{m.name}</b>
                  <small>{m.description}</small>
                </label>
              ))}
            </fieldset>
            <label className="toggle">
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
              <span>Private — join by code only</span>
            </label>
            <Button tone="red" size="lg" type="submit" sound="join">
              Create Lobby
            </Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
