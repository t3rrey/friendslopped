export type DialPhase = 'clue' | 'guess' | 'counter' | 'reveal' | 'gameOver';
export type DialModeId = 'party' | 'teams';
export type Side = 'left' | 'right';
export type Team = 0 | 1;

export interface Spectrum {
  left: string;
  right: string;
}

export interface DialConfig {
  /** Party: how many times each player is the psychic. */
  psychicTurns: number;
  /** Teams: first team to this many points wins. */
  targetScore: number;
}

export interface DialMode {
  id: DialModeId;
  name: string;
  description: string;
  /** Seconds per phase. */
  timings: Record<Exclude<DialPhase, 'gameOver'>, number>;
}

export type DialAction =
  | { type: 'clue'; text: string }
  | { type: 'reroll' }
  | { type: 'dial'; value: number }
  | { type: 'lock' }
  | { type: 'counter'; side: Side }
  | { type: 'ready' }
  /** Host only: skip the rest of the current phase. */
  | { type: 'advance' };

export interface DialPlayerView {
  id: string;
  name: string;
  seat: number;
  team: Team | null;
  score: number;
  locked: boolean;
  ready: boolean;
  /** Own guess always; everyone's once revealed. */
  guess: number | null;
  /** Points earned this round (party mode, at reveal). */
  roundPoints: number | null;
  gone: boolean;
}

export interface DialView {
  mode: DialMode;
  config: DialConfig;
  phase: DialPhase;
  round: number;
  /** Party mode only. */
  totalRounds: number | null;
  phaseEndsAt: number;
  meId: string;
  psychicId: string;
  activeTeam: Team | null;
  spectrum: Spectrum;
  clue: string | null;
  /** 0–100. Only the psychic sees it before the reveal. */
  target: number | null;
  canReroll: boolean;
  players: DialPlayerView[];
  teams: { name: string; score: number }[];
  /** Teams mode: the active team's shared needle, visible to everyone. */
  teamDial: number | null;
  counter: Side | null;
  result: { lines: string[]; teamPoints: number | null } | null;
  winnerIds: string[];
  winnerTeam: Team | null;
}
