import type { ComponentType, ReactNode } from 'react';
import type { LobbyState } from '@friendslopped/shared';
import { MafiaGame } from './mafia/MafiaGame.tsx';
import { MafiaRules, MafiaSettings } from './mafia/MafiaSettings.tsx';
import { TunedInGame } from './tunedin/TunedInGame.tsx';
import { TunedInLobby } from './tunedin/TunedInLobby.tsx';
import { TunedInRules, TunedInSettings } from './tunedin/TunedInSettings.tsx';

export interface ClientGame {
  /** Visual style: N64 cartridge-era or GameCube disc-era. */
  theme: 'n64' | 'cube';
  icon: ReactNode;
  labelArt: string;
  Settings: ComponentType<{ lobby: LobbyState; editable: boolean }>;
  Rules?: ComponentType<{ lobby: LobbyState }>;
  Game: ComponentType<{ lobby: LobbyState }>;
  /** Replaces the shared lobby room screen. */
  Lobby?: ComponentType<{ lobby: LobbyState }>;
}

// Client half of the game registry (server half lives in apps/server/src/games).
export const CLIENT_GAMES: Record<string, ClientGame> = {
  mafia: {
    theme: 'n64',
    icon: '☾',
    labelArt: 'radial-gradient(circle at 70% 30%, #ffe9a8 0 14%, transparent 15%), linear-gradient(180deg, #1a1f6b, #5b1030)',
    Settings: MafiaSettings,
    Rules: MafiaRules,
    Game: MafiaGame,
  },
  tunedin: {
    theme: 'cube',
    icon: '◠',
    labelArt: 'conic-gradient(from -90deg at 50% 100%, #ffc20e 0 25deg, #00a651 25deg 50deg, #e4202e 50deg 70deg, #00a651 70deg 95deg, #ffc20e 95deg 120deg, #2a5db0 120deg 180deg, transparent 180deg), linear-gradient(180deg, #2a5db0, #12205a)',
    Settings: TunedInSettings,
    Rules: TunedInRules,
    Game: TunedInGame,
    Lobby: TunedInLobby,
  },
};
