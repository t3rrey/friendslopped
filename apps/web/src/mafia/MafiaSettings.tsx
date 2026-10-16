import type { LobbyState } from '@friendslopped/shared';
import { MODES, ROLE_INFO, type MafiaConfig } from '@friendslopped/mafia';
import { send } from '../net.ts';
import { Stepper } from '../ui.tsx';

export function MafiaSettings({ lobby, editable }: { lobby: LobbyState; editable: boolean }) {
  const config = lobby.config as MafiaConfig;
  const update = (patch: Partial<MafiaConfig>) => send({ type: 'updateLobby', config: { ...config, ...patch } });
  const villagers = Math.max(0, lobby.players.length - config.killers - config.detectives - config.healers);

  return (
    <div className="role-config">
      <Stepper label="Killers" hint="Mafia" value={config.killers} min={1} max={8} disabled={!editable} onChange={(killers) => update({ killers })} />
      <Stepper label="Detectives" value={config.detectives} min={0} max={8} disabled={!editable} onChange={(detectives) => update({ detectives })} />
      <Stepper label="Healers" hint="Doctor" value={config.healers} min={0} max={8} disabled={!editable} onChange={(healers) => update({ healers })} />
      <div className="stepper stepper-static">
        <div className="stepper-label">Villagers <small>everyone else</small></div>
        <span className="stepper-value">{villagers}</span>
      </div>
    </div>
  );
}

export function MafiaRules({ lobby }: { lobby: LobbyState }) {
  const t = (MODES.find((m) => m.id === lobby.modeId) ?? MODES[0]!).timings;
  return (
    <div className="rules">
      <ol>
        <li>
          <b>Roles.</b> Everyone secretly gets a role. Killers know each other.
        </li>
        <li>
          <b>Night ({t.night}s).</b> Killers pick a victim (most votes wins; a tie goes to the first-seated killer&apos;s pick).
          Healers protect one player. Detectives investigate one player.
        </li>
        <li>
          <b>Dawn.</b> The victim is revealed with their role — unless a healer protected them.
        </li>
        <li>
          <b>Day ({t.day}s).</b> Discuss. When everyone alive is ready, voting opens early.
        </li>
        <li>
          <b>Vote ({t.vote}s).</b> Public vote. The top player is eliminated only with strictly more votes than anyone else
          <em> and</em> skip. Ties eliminate nobody.
        </li>
        <li>
          <b>Win.</b> Town wins when every killer is gone. Killers win once they equal or outnumber the town.
        </li>
      </ol>
      <ul className="role-cards">
        {(Object.keys(ROLE_INFO) as (keyof typeof ROLE_INFO)[]).map((r) => (
          <li key={r} className={`role-mini role-${r}`}>
            <b>{ROLE_INFO[r].name}</b>
            <small>{ROLE_INFO[r].blurb}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
