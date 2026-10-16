import type { ComponentType, ReactNode } from 'react';
import type { LobbyState } from '@friendslopped/shared';
import { MafiaGame } from './mafia/MafiaGame.tsx';
import { MafiaRules, MafiaSettings } from './mafia/MafiaSettings.tsx';

export interface ClientGame {
  icon: ReactNode;
  labelArt: string;
  Settings: ComponentType<{ lobby: LobbyState; editable: boolean }>;
  Rules?: ComponentType<{ lobby: LobbyState }>;
  Game: ComponentType<{ lobby: LobbyState }>;
}

// Client half of the game registry (server half lives in apps/server/src/games).
export const CLIENT_GAMES: Record<string, ClientGame> = {
  mafia: {
    icon: '☾',
    labelArt: 'radial-gradient(circle at 70% 30%, #ffe9a8 0 14%, transparent 15%), linear-gradient(180deg, #1a1f6b, #5b1030)',
    Settings: MafiaSettings,
    Rules: MafiaRules,
    Game: MafiaGame,
  },
};
