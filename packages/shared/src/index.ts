// Game-agnostic lobby protocol shared by the server and every game client.

export interface GameModeInfo {
  id: string;
  name: string;
  description: string;
}

export interface GameInfo {
  id: string;
  name: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  modes: GameModeInfo[];
}

export interface LobbyPlayer {
  id: string;
  name: string;
  color: number;
  connected: boolean;
  isHost: boolean;
}

export type LobbyStatus = 'waiting' | 'playing';

export interface LobbySummary {
  code: string;
  name: string;
  gameId: string;
  modeId: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: LobbyStatus;
}

export interface LobbyState<Config = unknown, GameView = unknown> {
  code: string;
  name: string;
  gameId: string;
  modeId: string;
  hostId: string;
  isPrivate: boolean;
  status: LobbyStatus;
  maxPlayers: number;
  players: LobbyPlayer[];
  config: Config;
  /** Problem preventing the host from starting, or null when ready. */
  startError: string | null;
  /** This player's personalised view of the running game. */
  game: GameView | null;
}

export type ClientMessage =
  | { type: 'hello'; name: string; sessionToken?: string }
  | { type: 'setName'; name: string }
  | { type: 'listLobbies' }
  | { type: 'createLobby'; gameId: string; modeId: string; name: string; isPrivate: boolean }
  | { type: 'joinLobby'; code: string }
  | { type: 'leaveLobby' }
  | { type: 'updateLobby'; modeId?: string; config?: unknown; name?: string; isPrivate?: boolean }
  | { type: 'kick'; playerId: string }
  | { type: 'startGame' }
  | { type: 'returnToLobby' }
  | { type: 'gameAction'; action: unknown };

export type ServerMessage =
  | { type: 'welcome'; playerId: string; sessionToken: string; name: string; games: GameInfo[] }
  | { type: 'lobbies'; lobbies: LobbySummary[] }
  | { type: 'lobby'; lobby: LobbyState | null; serverNow: number }
  | { type: 'error'; message: string }
  | { type: 'kicked' };

export const NAME_MAX = 16;
export const LOBBY_NAME_MAX = 28;

export function cleanName(raw: unknown, max = NAME_MAX): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}
