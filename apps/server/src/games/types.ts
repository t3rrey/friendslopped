import type { GameInfo } from '@friendslopped/shared';

export interface GameContext {
  now: number;
  isHost: boolean;
}

/** A running match. Lobbies talk to every game through this interface. */
export interface GameInstance {
  handle(playerId: string, action: unknown, ctx: GameContext): string | null;
  /** Advance timers; returns true if anything changed. */
  tick(now: number): boolean;
  view(playerId: string): unknown;
  playerLeft(playerId: string, now: number): void;
  isOver(): boolean;
}

export interface GameDefinition<Config = unknown> {
  info: GameInfo;
  defaultConfig(): Config;
  normalizeConfig(raw: unknown, prev: Config): Config;
  /** Why the game can't start with this config/player count, or null. */
  startError(config: Config, playerCount: number, modeId: string): string | null;
  create(opts: { players: { id: string; name: string }[]; config: Config; modeId: string; now: number }): GameInstance;
}
