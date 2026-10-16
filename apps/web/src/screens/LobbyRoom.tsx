import type { LobbyState } from '@friendslopped/shared';
import { inviteLink, send, toast, useNet } from '../net.ts';
import { Avatar, Button, ChunkyText, Panel } from '../ui.tsx';
import { CLIENT_GAMES } from '../games.tsx';

export function LobbyRoom({ lobby }: { lobby: LobbyState }) {
  const me = useNet((s) => s.me)!;
  const game = useNet((s) => s.games.find((g) => g.id === lobby.gameId));
  const client = CLIENT_GAMES[lobby.gameId];
  const isHost = lobby.hostId === me.id;
  const Settings = client?.Settings;

  return (
    <div className="screen">
      <header className="screen-head">
        <Button tone="z" size="sm" sound="back" onClick={() => send({ type: 'leaveLobby' })}>
          ◀ Leave
        </Button>
        <h1 className="heading heading-sm">
          <ChunkyText text={lobby.name} />
        </h1>
        <button
          type="button"
          className="code-chip"
          title="Copy invite link"
          onClick={() => {
            void navigator.clipboard?.writeText(inviteLink(lobby.code));
            toast('Invite link copied!');
          }}
        >
          CODE <b>{lobby.code}</b>
        </button>
      </header>

      <div className="room">
        <Panel title={`Players ${lobby.players.length}/${lobby.maxPlayers}`} className="room-players">
          <ul className="roster">
            {lobby.players.map((p) => (
              <li key={p.id} className={`roster-row ${p.connected ? '' : 'roster-away'}`}>
                <Avatar name={p.name} color={p.color} />
                <span className="roster-name">
                  {p.name}
                  {p.id === me.id && <em> (you)</em>}
                </span>
                {p.isHost && <span className="crown" title="Host">★ HOST</span>}
                {!p.connected && <span className="away">away</span>}
                {isHost && p.id !== me.id && (
                  <Button tone="z" size="sm" sound="back" onClick={() => send({ type: 'kick', playerId: p.id })}>
                    Kick
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {game && lobby.players.length < game.minPlayers && (
            <p className="hint">
              Waiting for {game.minPlayers - lobby.players.length} more… share the code <b>{lobby.code}</b>.
            </p>
          )}
        </Panel>

        <div className="room-side">
          <Panel title={isHost ? 'Game Setup' : 'Game Setup (host only)'} accent="c">
            {game && (
              <fieldset className="modes" disabled={!isHost}>
                <legend>Mode</legend>
                {game.modes.map((m) => (
                  <label key={m.id} className={`mode ${m.id === lobby.modeId ? 'mode-on' : ''}`}>
                    <input
                      type="radio"
                      name="lobby-mode"
                      checked={m.id === lobby.modeId}
                      onChange={() => send({ type: 'updateLobby', modeId: m.id })}
                    />
                    <b>{m.name}</b>
                    <small>{m.description}</small>
                  </label>
                ))}
              </fieldset>
            )}
            {Settings && <Settings lobby={lobby} editable={isHost} />}
            <label className="toggle">
              <input
                type="checkbox"
                disabled={!isHost}
                checked={lobby.isPrivate}
                onChange={(e) => send({ type: 'updateLobby', isPrivate: e.target.checked })}
              />
              <span>Private lobby</span>
            </label>
          </Panel>

          {isHost ? (
            <div className="start-box">
              <Button tone="red" size="lg" sound="fanfare" disabled={!!lobby.startError} onClick={() => send({ type: 'startGame' })}>
                Start Game
              </Button>
              {lobby.startError && <p className="hint">{lobby.startError}</p>}
            </div>
          ) : (
            <p className="waiting">Waiting for the host to start<span className="dots" /></p>
          )}
        </div>
      </div>

      {client?.Rules && (
        <Panel title="How to Play" className="rules-panel">
          <client.Rules lobby={lobby} />
        </Panel>
      )}
    </div>
  );
}
