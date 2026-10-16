import { useState } from 'react';
import type { LobbyPlayer, LobbyState } from '@friendslopped/shared';
import type { DialPlayerView, DialView } from '@friendslopped/tunedin';
import { gameAction, send, useNet, useSecondsUntil } from '../net.ts';
import { Avatar, Button, ChunkyText, Panel } from '../ui.tsx';
import { playerColor } from '../colors.ts';
import { Dial, type Needle } from './Dial.tsx';

const TEAM_CLASS = ['team-red', 'team-blue'] as const;

export function TunedInGame({ lobby }: { lobby: LobbyState }) {
  const view = lobby.game as DialView;
  const me = useNet((s) => s.me)!;
  const isHost = lobby.hostId === me.id;
  const lobbyPlayers = new Map(lobby.players.map((p) => [p.id, p]));
  const colorOf = (id: string) => playerColor(lobbyPlayers.get(id)?.color ?? 0);
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '?';

  const teams = view.mode.id === 'teams';
  const myself = view.players.find((p) => p.id === view.meId)!;
  const isPsychic = view.psychicId === view.meId;
  const onActiveTeam = !teams || myself.team === view.activeTeam;
  const canDial = view.phase === 'guess' && !isPsychic && onActiveTeam && !myself.locked;
  const revealed = view.phase === 'reveal' || view.phase === 'gameOver';

  // Needles: the shared team needle, or each player's own needle in party mode.
  const needles: Needle[] = teams
    ? view.teamDial === null
      ? []
      : [{ id: 'team', value: view.teamDial, color: view.activeTeam === 0 ? '#e4202e' : '#3d8bff', label: '', mine: canDial }]
    : view.players
        .filter((p) => p.guess !== null)
        .map((p) => ({ id: p.id, value: p.guess!, color: colorOf(p.id), label: p.name.slice(0, 1).toUpperCase(), mine: p.id === view.meId }));
  const editable = canDial ? { value: (teams ? view.teamDial : myself.guess) ?? 50, label: teams ? '' : 'ME' } : null;

  return (
    <div className={`tunedin phase-${view.phase}`}>
      <div className="phase-banner" key={`${view.phase}-${view.round}`} aria-hidden>
        <ChunkyText text={bannerText(view)} />
      </div>
      <Hud view={view} isHost={isHost} />
      <div className="tunedin-body">
        <div className="tunedin-main">
          <div className="clue-bubble">
            {view.clue ? (
              <>
                <span className="clue-text">“{view.clue}”</span>
                <small>— {nameOf(view.psychicId)}, the psychic</small>
              </>
            ) : (
              <span className="clue-waiting">
                {isPsychic ? 'Your clue goes here' : `${nameOf(view.psychicId)} is thinking of a clue`}
                <span className="dots" />
              </span>
            )}
          </div>
          <Dial
            spectrum={view.spectrum}
            target={view.target}
            needles={needles}
            editable={editable}
            bandsKey={`${view.round}-${revealed}`}
            onChange={(value) => gameAction({ type: 'dial', value })}
          />
          <Stage view={view} isHost={isHost} nameOf={nameOf} />
        </div>
        <Scoreboard view={view} lobbyPlayers={lobbyPlayers} />
      </div>
    </div>
  );
}

function bannerText(view: DialView) {
  if (view.phase === 'gameOver') return 'Game Over';
  if (view.phase === 'clue') return view.mode.id === 'teams' ? `${view.teams[view.activeTeam!]!.name}` : `Round ${view.round}`;
  if (view.phase === 'guess') return 'Tune In!';
  if (view.phase === 'counter') return 'Left or Right?';
  return 'Reveal!';
}

function Hud({ view, isHost }: { view: DialView; isHost: boolean }) {
  const seconds = useSecondsUntil(view.phaseEndsAt);
  const label =
    view.mode.id === 'teams'
      ? `First to ${view.config.targetScore}`
      : `Round ${Math.min(view.round, view.totalRounds ?? 0)}/${view.totalRounds}`;
  return (
    <header className="hud">
      <div className="hud-phase">
        <span className="hud-icon icon-dial" />
        <ChunkyText text={label} />
      </div>
      {view.phase !== 'gameOver' && (
        <div className={`hud-timer ${seconds <= 10 ? 'hud-timer-low' : ''}`}>
          <span>⏱</span>
          {seconds}
        </div>
      )}
      <div className="hud-right">
        {view.mode.id === 'teams' &&
          view.teams.map((t, i) => (
            <span key={t.name} className={`team-chip ${TEAM_CLASS[i]} ${view.activeTeam === i ? 'team-chip-active' : ''}`}>
              {t.name.split(' ')[0]} {t.score}
            </span>
          ))}
        {isHost && view.phase !== 'gameOver' && (
          <Button tone="z" size="sm" title="Host: skip the rest of this phase" onClick={() => gameAction({ type: 'advance' })}>
            Skip ▶▶
          </Button>
        )}
      </div>
    </header>
  );
}

function Stage({ view, isHost, nameOf }: { view: DialView; isHost: boolean; nameOf: (id: string) => string }) {
  const [clue, setClue] = useState('');
  const teams = view.mode.id === 'teams';
  const me = view.players.find((p) => p.id === view.meId)!;
  const isPsychic = view.psychicId === view.meId;
  const activeName = teams ? view.teams[view.activeTeam!]!.name : '';
  const onActiveTeam = !teams || me.team === view.activeTeam;
  const present = view.players.filter((p) => !p.gone);

  switch (view.phase) {
    case 'clue':
      if (!isPsychic) {
        return (
          <div className="stage">
            <h3 className="stage-title">{nameOf(view.psychicId)} is the psychic</h3>
            <p>They can see where the target is. Get ready to read their mind.</p>
          </div>
        );
      }
      return (
        <div className="stage">
          <h3 className="stage-title">You're the psychic!</h3>
          <p>
            Only you can see the target. Give a clue that sits that far between <b>{view.spectrum.left}</b> and <b>{view.spectrum.right}</b>.
          </p>
          <form
            className="inline-form clue-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!clue.trim()) return;
              gameAction({ type: 'clue', text: clue });
              setClue('');
            }}
          >
            <input autoFocus value={clue} maxLength={60} placeholder="e.g. Lukewarm tea" onChange={(e) => setClue(e.target.value)} />
            <Button tone="b" type="submit" sound="select" disabled={!clue.trim()}>
              Send clue
            </Button>
          </form>
          {view.canReroll && (
            <Button tone="c" size="sm" onClick={() => gameAction({ type: 'reroll' })}>
              ↻ Swap card (once)
            </Button>
          )}
        </div>
      );

    case 'guess': {
      if (isPsychic) {
        return (
          <div className="stage">
            <h3 className="stage-title">No hints! 🤐</h3>
            <p>Watch them squirm. You can see the target, they can't.</p>
          </div>
        );
      }
      if (teams) {
        return (
          <div className="stage">
            {onActiveTeam ? (
              <>
                <h3 className="stage-title">Turn the dial together</h3>
                <p>Anyone on {activeName} can move the needle. Argue it out, then lock it in.</p>
                <Button tone="red" size="lg" sound="select" onClick={() => gameAction({ type: 'lock' })}>
                  Lock it in
                </Button>
              </>
            ) : (
              <>
                <h3 className="stage-title">{activeName} is guessing</h3>
                <p>Watch the needle. Next you'll call whether the target is left or right of it.</p>
              </>
            )}
          </div>
        );
      }
      const guessers = present.filter((p) => p.id !== view.psychicId);
      const locked = guessers.filter((p) => p.locked).length;
      return (
        <div className="stage">
          <h3 className="stage-title">{me.locked ? 'Locked in!' : 'Drag your needle'}</h3>
          <p>
            {me.locked ? 'Waiting for everyone else' : 'Tap or drag on the dial, or use the arrow keys.'} ({locked}/{guessers.length} locked)
          </p>
          {!me.locked && (
            <Button tone="red" size="lg" sound="select" onClick={() => gameAction({ type: 'lock' })}>
              Lock it in
            </Button>
          )}
        </div>
      );
    }

    case 'counter': {
      const otherName = view.teams[1 - view.activeTeam!]!.name;
      return (
        <div className="stage">
          {onActiveTeam ? (
            <>
              <h3 className="stage-title">Needle locked</h3>
              <p>{otherName} is deciding whether the target is left or right of your needle…</p>
            </>
          ) : (
            <>
              <h3 className="stage-title">Is the target left or right?</h3>
              <p>Call it correctly to steal a point (no steal if they hit the bullseye).</p>
              <div className="stage-actions">
                <Button tone="a" size="lg" sound="select" onClick={() => gameAction({ type: 'counter', side: 'left' })}>
                  ◀ Left
                </Button>
                <Button tone="a" size="lg" sound="select" onClick={() => gameAction({ type: 'counter', side: 'right' })}>
                  Right ▶
                </Button>
              </div>
            </>
          )}
        </div>
      );
    }

    case 'reveal': {
      const ready = present.filter((p) => p.ready).length;
      return (
        <div className="stage stage-announce">
          {view.result?.lines.map((line, i) => (
            <p key={i} className={`announce ${/BULLSEYE|Bullseye/.test(line) ? 'announce-win' : ''}`}>
              {line}
            </p>
          ))}
          {!teams && me.roundPoints !== null && (
            <p className="points-pop">+{me.roundPoints}</p>
          )}
          <Button tone="b" sound="select" disabled={me.ready} onClick={() => gameAction({ type: 'ready' })}>
            {me.ready ? `✓ Ready (${ready}/${present.length})` : `Next round (${ready}/${present.length})`}
          </Button>
        </div>
      );
    }

    case 'gameOver': {
      const iWon = view.winnerIds.includes(view.meId);
      const title = teams
        ? view.winnerTeam === null
          ? "It's a Draw!"
          : `${view.teams[view.winnerTeam]!.name} Wins!`
        : view.winnerIds.length > 1
          ? 'Shared Victory!'
          : `${nameOf(view.winnerIds[0] ?? '')} Wins!`;
      return (
        <div className={`stage stage-over ${iWon ? 'winner-town' : 'winner-killers'}`}>
          <ChunkyText text={title} className="winner-text" />
          <p>{iWon ? 'Total mind-reader. 🧠' : 'Next time, tune in harder.'}</p>
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
}

function Scoreboard({ view, lobbyPlayers }: { view: DialView; lobbyPlayers: Map<string, LobbyPlayer> }) {
  const row = (p: DialPlayerView) => (
    <li key={p.id} className={`score-row ${p.gone ? 'roster-away' : ''} ${p.id === view.meId ? 'score-me' : ''}`}>
      <Avatar name={p.name} color={lobbyPlayers.get(p.id)?.color ?? p.seat} size="sm" />
      <span className="score-name">
        {p.name}
        {p.id === view.psychicId && view.phase !== 'gameOver' && <span className="psychic-tag">🔮</span>}
      </span>
      {p.locked && view.phase === 'guess' && <span className="lock-tag">🔒</span>}
      {p.roundPoints !== null && <span className="round-pts">+{p.roundPoints}</span>}
      {view.mode.id === 'party' && <b className="score-pts">{p.score}</b>}
    </li>
  );

  if (view.mode.id === 'teams') {
    return (
      <Panel title="Teams" className="scoreboard">
        {view.teams.map((t, i) => (
          <div key={t.name} className={`team-block ${TEAM_CLASS[i]} ${view.activeTeam === i ? 'team-block-active' : ''}`}>
            <h3>
              {t.name} <b>{t.score}</b>
            </h3>
            <ul className="score-list">{view.players.filter((p) => p.team === i).map(row)}</ul>
          </div>
        ))}
      </Panel>
    );
  }
  const ranked = [...view.players].sort((a, b) => b.score - a.score || a.seat - b.seat);
  return (
    <Panel title="Scores" className="scoreboard">
      <ol className="score-list">{ranked.map(row)}</ol>
    </Panel>
  );
}
