import { useState } from 'react';
import type { LobbyState } from '@friendslopped/shared';
import { MIN_PLAYERS, SPECTRUMS, scoreFor, type DialModeId } from '@friendslopped/tunedin';
import { inviteLink, send, toast, useNet } from '../net.ts';
import { Avatar, Button } from '../ui.tsx';
import { Dial } from './Dial.tsx';
import { TunedInRules, TunedInSettings } from './TunedInSettings.tsx';

const MODE_ICON: Record<DialModeId, string> = { party: '◉', teams: '◐' };
/** Empty seats shown so the room never looks bare. */
const SHOWN_SEATS = 8;

export function TunedInLobby({ lobby }: { lobby: LobbyState }) {
  const me = useNet((s) => s.me)!;
  const game = useNet((s) => s.games.find((g) => g.id === lobby.gameId));
  const isHost = lobby.hostId === me.id;
  const min = MIN_PLAYERS[lobby.modeId as DialModeId] ?? 3;
  const empty = Math.max(0, Math.max(SHOWN_SEATS, min) - lobby.players.length);

  return (
    <div className="cube-lobby">
      <header className="cube-head">
        <Button tone="z" size="sm" sound="back" onClick={() => send({ type: 'leaveLobby' })}>
          ◀ Leave
        </Button>
        <div className="cube-logo">
          <CubeMark />
          <div>
            <h1 className="cube-wordmark">Tuned In</h1>
            <p className="cube-subtitle">{lobby.name}</p>
          </div>
        </div>
        <button
          type="button"
          className="memory-card"
          title="Copy invite link"
          onClick={() => {
            void navigator.clipboard?.writeText(inviteLink(lobby.code));
            toast('Invite link copied!');
          }}
        >
          <span className="memory-card-slot">SLOT A</span>
          <b>{lobby.code}</b>
          <small>tap to copy invite</small>
        </button>
      </header>

      <div className="cube-grid">
        <section className="glass cube-players">
          <h2 className="glass-title">
            Players <span>{lobby.players.length}/{lobby.maxPlayers}</span>
          </h2>
          <ul className="bubbles">
            {lobby.players.map((p) => (
              <li key={p.id} className={`bubble ${p.connected ? '' : 'bubble-away'} ${p.id === me.id ? 'bubble-me' : ''}`}>
                <Avatar name={p.name} color={p.color} size="lg" />
                <span className="bubble-name">{p.name}</span>
                {p.isHost && <span className="bubble-host">HOST</span>}
                {isHost && p.id !== me.id && (
                  <button type="button" className="bubble-kick" aria-label={`Kick ${p.name}`} onClick={() => send({ type: 'kick', playerId: p.id })}>
                    ✕
                  </button>
                )}
              </li>
            ))}
            {Array.from({ length: empty }, (_, i) => (
              <li key={`empty-${i}`} className="bubble bubble-empty" aria-hidden>
                <span className="bubble-ghost">?</span>
                <span className="bubble-name">waiting…</span>
              </li>
            ))}
          </ul>
          {lobby.players.length < min && (
            <p className="glass-hint">
              Need {min - lobby.players.length} more for {lobby.modeId === 'teams' ? 'Teams' : 'Party'}. Share code <b>{lobby.code}</b>.
            </p>
          )}
        </section>

        <section className="glass cube-setup">
          <h2 className="glass-title">{isHost ? 'Choose a Mode' : 'Mode (host picks)'}</h2>
          <div className="mode-cubes" role="radiogroup" aria-label="Game mode">
            {game?.modes.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={m.id === lobby.modeId}
                disabled={!isHost}
                className={`mode-cube ${m.id === lobby.modeId ? 'mode-cube-on' : ''}`}
                onClick={() => send({ type: 'updateLobby', modeId: m.id })}
              >
                <span className="mode-cube-icon">{MODE_ICON[m.id as DialModeId] ?? '◆'}</span>
                <b>{m.name}</b>
                <small>{m.description}</small>
              </button>
            ))}
          </div>
          <TunedInSettings lobby={lobby} editable={isHost} />
          <label className="toggle">
            <input
              type="checkbox"
              disabled={!isHost}
              checked={lobby.isPrivate}
              onChange={(e) => send({ type: 'updateLobby', isPrivate: e.target.checked })}
            />
            <span>Private lobby</span>
          </label>
          {isHost ? (
            <div className="start-box">
              <Button tone="red" size="lg" sound="fanfare" className="a-button" disabled={!!lobby.startError} onClick={() => send({ type: 'startGame' })}>
                <span className="a-glyph">A</span> Start
              </Button>
              {lobby.startError && <p className="glass-hint">{lobby.startError}</p>}
            </div>
          ) : (
            <p className="waiting">
              Waiting for the host to press <span className="a-glyph a-glyph-inline">A</span>
              <span className="dots" />
            </p>
          )}
        </section>

        <WarmUp />
      </div>

      <details className="glass booklet">
        <summary className="glass-title">Instruction Booklet</summary>
        <TunedInRules lobby={lobby} />
      </details>
    </div>
  );
}

/** A spinning glossy CSS cube, the lobby's logo mark. */
function CubeMark() {
  return (
    <div className="cube-mark" aria-hidden>
      <div className="cube-mark-inner">
        {['front', 'back', 'left', 'right', 'top', 'bottom'].map((face) => (
          <span key={face} className={`cube-face cube-${face}`} />
        ))}
      </div>
    </div>
  );
}

function newCard() {
  return {
    spectrum: SPECTRUMS[Math.floor(Math.random() * SPECTRUMS.length)]!,
    target: 5 + Math.round(Math.random() * 90),
  };
}

/** Solo practice dial so people have something to fiddle with while waiting. */
function WarmUp() {
  const [card, setCard] = useState(newCard);
  const [value, setValue] = useState(50);
  const [revealed, setRevealed] = useState(false);
  const [round, setRound] = useState(0);
  const points = revealed ? scoreFor(value, card.target) : null;

  return (
    <section className="glass cube-warmup">
      <h2 className="glass-title">Warm-up Dial</h2>
      <p className="warmup-hint">Practice solo: guess where the hidden target sits, then reveal.</p>
      <Dial
        spectrum={card.spectrum}
        target={revealed ? card.target : null}
        needles={revealed ? [{ id: 'me', value, color: '#ffffff', label: 'ME', mine: true }] : []}
        editable={revealed ? null : { value, label: 'ME' }}
        onChange={(v) => setValue(v)}
        bandsKey={`${round}-${revealed}`}
      />
      <div className="stage-actions">
        {revealed ? (
          <>
            <span className="warmup-points">{points ? `+${points}` : 'Miss!'}</span>
            <Button
              tone="c"
              sound="select"
              onClick={() => {
                setCard(newCard());
                setValue(50);
                setRevealed(false);
                setRound((r) => r + 1);
              }}
            >
              New card
            </Button>
          </>
        ) : (
          <Button tone="b" sound="join" onClick={() => setRevealed(true)}>
            Reveal
          </Button>
        )}
      </div>
    </section>
  );
}
