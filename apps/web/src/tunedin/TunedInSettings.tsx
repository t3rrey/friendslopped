import type { LobbyState } from '@friendslopped/shared';
import { MIN_PLAYERS, type DialConfig } from '@friendslopped/tunedin';
import { send } from '../net.ts';
import { Stepper } from '../ui.tsx';

export function TunedInSettings({ lobby, editable }: { lobby: LobbyState; editable: boolean }) {
  const config = lobby.config as DialConfig;
  const update = (patch: Partial<DialConfig>) => send({ type: 'updateLobby', config: { ...config, ...patch } });

  if (lobby.modeId === 'teams') {
    return (
      <div className="role-config">
        <Stepper label="Target score" hint="first team there wins" value={config.targetScore} min={5} max={20} disabled={!editable} onChange={(targetScore) => update({ targetScore })} />
      </div>
    );
  }
  return (
    <div className="role-config">
      <Stepper
        label="Turns each"
        hint={`${lobby.players.length * config.psychicTurns} rounds total`}
        value={config.psychicTurns}
        min={1}
        max={3}
        disabled={!editable}
        onChange={(psychicTurns) => update({ psychicTurns })}
      />
    </div>
  );
}

export function TunedInRules({ lobby }: { lobby: LobbyState }) {
  const teams = lobby.modeId === 'teams';
  return (
    <div className="rules">
      <ol>
        <li>
          <b>The card.</b> Each round shows two opposites, like <em>Cold ↔ Hot</em>. A target is hidden somewhere on the dial between them.
        </li>
        <li>
          <b>The psychic</b> is the only one who can see the target. They give a single clue for where it sits, like “Lukewarm tea”. They can swap the card once.
        </li>
        {teams ? (
          <>
            <li>
              <b>Guess together.</b> The psychic's team shares one needle. Anyone on the team can move it. Lock it in when you agree.
            </li>
            <li>
              <b>Steal.</b> The other team calls whether the target is left or right of the needle. A correct call scores 1, unless the guessing team hit the bullseye.
            </li>
            <li>
              <b>Win.</b> Teams take turns. The first team to {(lobby.config as DialConfig).targetScore} points at the end of a round wins. Ties play on.
            </li>
          </>
        ) : (
          <>
            <li>
              <b>Guess alone.</b> Everyone else drags their own needle in secret, then locks it in.
            </li>
            <li>
              <b>Score.</b> Bullseye = 4, close = 3, nearby = 2. The psychic earns the average of everyone's points, so good clues pay off.
            </li>
            <li>
              <b>Win.</b> Everyone takes a turn as psychic. The highest score at the end wins.
            </li>
          </>
        )}
      </ol>
      <p className="small">
        Needs at least {MIN_PLAYERS[teams ? 'teams' : 'party']} players.{teams && ' Teams are dealt randomly when the game starts.'}
      </p>
    </div>
  );
}
