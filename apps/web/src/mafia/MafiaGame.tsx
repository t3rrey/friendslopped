import { useState, type ReactNode } from 'react';
import type { LobbyPlayer, LobbyState } from '@friendslopped/shared';
import { ROLE_INFO, SKIP, type ChatChannel, type MafiaView, type PlayerView, type Role } from '@friendslopped/mafia';
import { gameAction, send, useNet, useSecondsUntil } from '../net.ts';
import { Avatar, Button, ChunkyText, Panel } from '../ui.tsx';

const PHASE_TITLE: Record<MafiaView['phase'], (round: number) => string> = {
  reveal: () => 'Your Role',
  night: (r) => `Night ${r}`,
  dawn: (r) => `Dawn ${r}`,
  day: (r) => `Day ${r}`,
  vote: (r) => `Vote ${r}`,
  verdict: () => 'Verdict',
  gameOver: () => 'Game Over',
};

const ACTION_VERB = { kill: 'kill', investigate: 'investigate', protect: 'protect' } as const;
const CHANNEL_NAME: Record<ChatChannel, string> = { town: 'Town', killers: 'Killers', dead: 'Ghosts' };

export function MafiaGame({ lobby }: { lobby: LobbyState }) {
  const view = lobby.game as MafiaView;
  const me = useNet((s) => s.me)!;
  const isHost = lobby.hostId === me.id;
  const colors = new Map(lobby.players.map((p) => [p.id, p]));

  return (
    <div className={`mafia phase-${view.phase}`}>
      <PhaseBanner key={`${view.phase}-${view.round}`} view={view} />
      <Hud view={view} isHost={isHost} />
      <div className="mafia-body">
        <div className="mafia-main">
          <Stage view={view} isHost={isHost} />
          <PlayerGrid view={view} lobbyPlayers={colors} />
        </div>
        <ChatPanel view={view} lobbyPlayers={colors} />
      </div>
    </div>
  );
}

/** Big Mario-64-style title card that sweeps in on every phase change. */
function PhaseBanner({ view }: { view: MafiaView }) {
  return (
    <div className="phase-banner" aria-hidden>
      <ChunkyText text={PHASE_TITLE[view.phase](view.round)} />
    </div>
  );
}

function Hud({ view, isHost }: { view: MafiaView; isHost: boolean }) {
  const seconds = useSecondsUntil(view.phaseEndsAt);
  const alive = view.players.filter((p) => p.alive).length;
  return (
    <header className="hud">
      <div className="hud-phase">
        <span className={`hud-icon icon-${view.phase}`} />
        <ChunkyText text={PHASE_TITLE[view.phase](view.round)} />
      </div>
      {view.phase !== 'gameOver' && (
        <div className={`hud-timer ${seconds <= 10 ? 'hud-timer-low' : ''}`}>
          <span>⏱</span>
          {seconds}
        </div>
      )}
      <div className="hud-right">
        <span className="hud-alive">
          ♥ × {alive}
        </span>
        <span className={`role-chip role-${view.myRole}`}>{ROLE_INFO[view.myRole].name}{!view.myAlive && ' ✝'}</span>
        {isHost && view.phase !== 'gameOver' && (
          <Button tone="z" size="sm" title="Host: skip the rest of this phase" onClick={() => gameAction({ type: 'advance' })}>
            Skip ▶▶
          </Button>
        )}
      </div>
    </header>
  );
}

function Stage({ view, isHost }: { view: MafiaView; isHost: boolean }) {
  const me = view.players.find((p) => p.id === view.meId)!;
  const name = (id: string | null) => view.players.find((p) => p.id === id)?.name ?? '—';
  const living = view.players.filter((p) => p.alive);

  switch (view.phase) {
    case 'reveal': {
      const info = ROLE_INFO[view.myRole];
      const allies = view.players.filter((p) => p.role === 'killer' && p.id !== view.meId);
      return (
        <div className="stage stage-reveal">
          <div className={`role-card role-${view.myRole}`}>
            <span className="role-card-kicker">You are the</span>
            <ChunkyText text={info.name} className="role-card-name" />
            <p>{info.blurb}</p>
            {allies.length > 0 && <p className="allies">Fellow killers: {allies.map((a) => a.name).join(', ')}</p>}
          </div>
          <ReadyButton view={view} label="Got it!" />
        </div>
      );
    }
    case 'night': {
      if (!view.myAlive) return <StageNote title="You are a ghost">You can see every role now. Chat with the other ghosts.</StageNote>;
      if (!view.night) {
        return (
          <StageNote title="You are asleep… z z z">
            Villagers have no night power. Wait for dawn — and keep your eyes shut.
          </StageNote>
        );
      }
      const verb = ACTION_VERB[view.night.action];
      return (
        <div className="stage">
          <h3 className="stage-title">
            Choose someone to <span className={`verb verb-${view.night.action}`}>{verb}</span>
          </h3>
          <p>
            {view.night.targetId ? (
              <>
                Target: <b>{name(view.night.targetId)}</b> — tap them again to cancel.
              </>
            ) : (
              'Tap a player below.'
            )}
          </p>
          {view.night.allyPicks.length > 0 && (
            <ul className="ally-picks">
              {view.night.allyPicks.map((a) => (
                <li key={a.playerId}>
                  {name(a.playerId)} → <b>{a.targetId ? name(a.targetId) : 'thinking…'}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case 'dawn':
    case 'verdict':
      return (
        <div className="stage stage-announce">
          {view.announcement.map((e) => (
            <p key={e.id} className={`announce announce-${e.kind}`}>
              {e.text}
            </p>
          ))}
        </div>
      );
    case 'day': {
      const ready = living.filter((p) => p.ready).length;
      return (
        <div className="stage">
          <h3 className="stage-title">Discuss! Who seems suspicious?</h3>
          <p>
            Voting opens when the timer ends or everyone is ready ({ready}/{living.length}).
          </p>
          <div className="stage-actions">
            {me.alive && <ReadyButton view={view} label="Ready to vote" />}
            {isHost && (
              <Button tone="c" onClick={() => gameAction({ type: 'advance' })}>
                Start vote now
              </Button>
            )}
          </div>
        </div>
      );
    }
    case 'vote': {
      const mine = view.votes.find((v) => v.voterId === view.meId)?.targetId ?? null;
      return (
        <div className="stage">
          <h3 className="stage-title">Vote to eliminate</h3>
          {me.alive ? (
            <>
              <p>
                {mine ? (
                  <>
                    Your vote: <b>{mine === SKIP ? 'Skip' : name(mine)}</b> — you can change it until time runs out.
                  </>
                ) : (
                  'Tap a player to vote for them.'
                )}
              </p>
              <div className="stage-actions">
                <Button tone={mine === SKIP ? 'b' : 'z'} onClick={() => gameAction({ type: 'vote', targetId: mine === SKIP ? null : SKIP })}>
                  {mine === SKIP ? '✓ Skipping' : 'Skip vote'}
                </Button>
              </div>
            </>
          ) : (
            <p>The dead can only watch.</p>
          )}
          <p className="small">
            {view.votes.length}/{living.length} voted ·{' '}
            {view.votes.filter((v) => v.targetId === SKIP).length} skip
          </p>
        </div>
      );
    }
    case 'gameOver':
      return (
        <div className={`stage stage-over winner-${view.winner}`}>
          <ChunkyText text={view.winner === 'town' ? 'Town Wins!' : 'Killers Win!'} className="winner-text" />
          <p>
            {view.winner && ROLE_INFO[view.myRole].team === view.winner ? 'Victory! Your side won.' : 'Defeat. Better luck next time.'}
          </p>
          {isHost ? (
            <Button tone="red" size="lg" sound="join" onClick={() => send({ type: 'returnToLobby' })}>
              Back to Lobby
            </Button>
          ) : (
            <p className="waiting">Waiting for the host…</p>
          )}
        </div>
      );
  }
}

function StageNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="stage">
      <h3 className="stage-title">{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function ReadyButton({ view, label }: { view: MafiaView; label: string }) {
  const me = view.players.find((p) => p.id === view.meId)!;
  return (
    <Button tone="b" disabled={me.ready} sound="select" onClick={() => gameAction({ type: 'ready' })}>
      {me.ready ? '✓ Ready' : label}
    </Button>
  );
}

function PlayerGrid({ view, lobbyPlayers }: { view: MafiaView; lobbyPlayers: Map<string, LobbyPlayer> }) {
  const night = view.night;
  const voting = view.phase === 'vote' && view.myAlive;
  const myVote = view.votes.find((v) => v.voterId === view.meId)?.targetId ?? null;
  const showVotes = view.phase === 'vote' || view.phase === 'verdict';

  return (
    <ul className="pgrid">
      {view.players.map((p) => {
        const targetable = night ? night.validTargetIds.includes(p.id) : voting && p.alive;
        const selected = night ? night.targetId === p.id : voting && myVote === p.id;
        const voters = showVotes ? view.votes.filter((v) => v.targetId === p.id).map((v) => v.voterId) : [];
        const allyPicked = night?.allyPicks.filter((a) => a.targetId === p.id) ?? [];
        const onPick = () => {
          if (night) gameAction({ type: 'nightTarget', targetId: selected ? null : p.id });
          else gameAction({ type: 'vote', targetId: selected ? null : p.id });
        };
        return (
          <li key={p.id}>
            <button
              type="button"
              className={[
                'pcard',
                p.alive ? '' : 'pcard-dead',
                targetable ? 'pcard-target' : '',
                selected ? `pcard-selected pcard-${night?.action ?? 'vote'}` : '',
                p.id === view.meId ? 'pcard-me' : '',
              ].join(' ')}
              disabled={!targetable}
              onClick={onPick}
            >
              <Avatar name={p.name} color={lobbyPlayers.get(p.id)?.color ?? p.seat} size="lg" dead={!p.alive} />
              <span className="pcard-name">
                {p.name}
                {p.id === view.meId && <em> you</em>}
              </span>
              <PlayerBadges p={p} view={view} />
              {(view.phase === 'reveal' || view.phase === 'day') && p.alive && p.ready && <span className="pcard-ready">READY</span>}
              {allyPicked.length > 0 && <span className="pcard-ally-pick">☠ {allyPicked.length}</span>}
              {voters.length > 0 && (
                <span className="pcard-votes" title={voters.map((v) => view.players.find((x) => x.id === v)?.name).join(', ')}>
                  {voters.map((v) => (
                    <i key={v} style={{ ['--c' as string]: `var(--p${lobbyPlayers.get(v)?.color ?? 0})` }} />
                  ))}
                  <b>{voters.length}</b>
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PlayerBadges({ p, view }: { p: PlayerView; view: MafiaView }) {
  const role: Role | null = p.role;
  return (
    <span className="pcard-badges">
      {!p.alive && <span className="badge badge-dead">✝ dead</span>}
      {role && (p.id !== view.meId || !p.alive) && <span className={`badge role-${role}`}>{ROLE_INFO[role].name}</span>}
      {p.investigated && (
        <span className={`badge ${p.investigated === 'killers' ? 'badge-guilty' : 'badge-innocent'}`}>
          {p.investigated === 'killers' ? '🔍 KILLER' : '🔍 innocent'}
        </span>
      )}
    </span>
  );
}

function ChatPanel({ view, lobbyPlayers }: { view: MafiaView; lobbyPlayers: Map<string, LobbyPlayer> }) {
  const tabs: (ChatChannel | 'log')[] = [...view.readChannels, 'log'];
  const [tab, setTab] = useState<ChatChannel | 'log' | null>(null);
  const [text, setText] = useState('');
  // Until a tab is picked, follow whichever channel you can currently talk in.
  const active = tab && tabs.includes(tab) ? tab : (view.canChat[0] ?? 'town');
  const canSend = active !== 'log' && view.canChat.includes(active);
  const messages = active === 'log' ? [] : view.chat.filter((m) => m.channel === active);

  return (
    <Panel className="chat" title="Comms">
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === active} className={`tab tab-${t}`} onClick={() => setTab(t)}>
            {t === 'log' ? 'Log' : CHANNEL_NAME[t]}
          </button>
        ))}
      </div>
      <div className="chat-scroll">
        {active === 'log' ? (
          <ol className="log">
            {view.log.map((e) => (
              <li key={e.id} className={`log-${e.kind} ${e.visibleTo ? 'log-private' : ''}`}>
                {e.text}
              </li>
            ))}
          </ol>
        ) : messages.length === 0 ? (
          <p className="empty">
            {active === 'killers' ? 'Only killers (and ghosts) can read this.' : active === 'dead' ? 'Ghost chat. The living cannot hear you.' : 'No messages yet.'}
          </p>
        ) : (
          <ol className="messages">
            {messages.map((m) => (
              <li key={m.id}>
                <b style={{ color: `var(--p${lobbyPlayers.get(m.fromId)?.color ?? 0})` }}>{m.fromName}</b> {m.text}
              </li>
            ))}
          </ol>
        )}
      </div>
      {active !== 'log' && (
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            gameAction({ type: 'chat', channel: active, text });
            setText('');
          }}
        >
          <input
            value={text}
            maxLength={280}
            disabled={!canSend}
            placeholder={canSend ? `Message ${CHANNEL_NAME[active]}…` : view.phase === 'night' ? 'Shh… the town is asleep.' : 'You cannot talk here.'}
            onChange={(e) => setText(e.target.value)}
          />
          <Button tone="a" size="sm" type="submit" disabled={!canSend || !text.trim()}>
            Send
          </Button>
        </form>
      )}
    </Panel>
  );
}
