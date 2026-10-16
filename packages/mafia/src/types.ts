export type Role = 'killer' | 'detective' | 'healer' | 'villager';
export type Team = 'killers' | 'town';
export type Phase = 'reveal' | 'night' | 'dawn' | 'day' | 'vote' | 'verdict' | 'gameOver';
export type TimedPhase = Exclude<Phase, 'gameOver'>;
export type ChatChannel = 'town' | 'killers' | 'dead';
export type NightActionKind = 'kill' | 'investigate' | 'protect';

export interface MafiaConfig {
  killers: number;
  detectives: number;
  healers: number;
}

export interface MafiaMode {
  id: string;
  name: string;
  description: string;
  /** Seconds per phase. */
  timings: Record<TimedPhase, number>;
}

export type MafiaAction =
  | { type: 'nightTarget'; targetId: string | null }
  | { type: 'vote'; targetId: string | null }
  | { type: 'ready' }
  | { type: 'chat'; channel: ChatChannel; text: string }
  /** Host only: skip the rest of the current phase. */
  | { type: 'advance' };

export type LogKind = 'system' | 'death' | 'save' | 'investigation' | 'vote' | 'win';

export interface LogEntry {
  id: number;
  round: number;
  phase: Phase;
  kind: LogKind;
  text: string;
  /** Restricts the entry to these players; public when absent. */
  visibleTo?: string[];
}

export interface ChatMessage {
  id: number;
  channel: ChatChannel;
  fromId: string;
  fromName: string;
  text: string;
}

export interface PlayerView {
  id: string;
  name: string;
  seat: number;
  alive: boolean;
  ready: boolean;
  /** Known to this viewer: own role, fellow killers, the dead, and everyone at game over. */
  role: Role | null;
  /** Detective findings visible to this viewer. */
  investigated: Team | null;
}

export interface MafiaView {
  phase: Phase;
  round: number;
  phaseEndsAt: number;
  mode: MafiaMode;
  config: MafiaConfig;
  meId: string;
  myRole: Role;
  myAlive: boolean;
  players: PlayerView[];
  night: {
    action: NightActionKind;
    targetId: string | null;
    validTargetIds: string[];
    /** Killers see each other's picks live. */
    allyPicks: { playerId: string; targetId: string | null }[];
  } | null;
  /** Public day votes; "skip" means abstain. */
  votes: { voterId: string; targetId: string }[];
  log: LogEntry[];
  /** What just happened, shown big at dawn, verdict and game over. */
  announcement: LogEntry[];
  chat: ChatMessage[];
  canChat: ChatChannel[];
  readChannels: ChatChannel[];
  winner: Team | null;
}
