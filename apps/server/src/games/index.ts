import {
  DEFAULT_CONFIG,
  MafiaGame,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MODES,
  normalizeConfig,
  validateConfig,
  type MafiaAction,
  type MafiaConfig,
} from '@friendslopped/mafia';
import * as tunedIn from '@friendslopped/tunedin';
import type { GameDefinition } from './types.ts';

const mafia: GameDefinition<MafiaConfig> = {
  info: {
    id: 'mafia',
    name: 'Mafia',
    tagline: 'Killers hide among the village. Find them before nightfall.',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    modes: MODES.map(({ id, name, description }) => ({ id, name, description })),
  },
  defaultConfig: () => ({ ...DEFAULT_CONFIG }),
  normalizeConfig: (raw, prev) => normalizeConfig(raw, prev),
  startError: validateConfig,
  create(opts) {
    const game = new MafiaGame(opts);
    return {
      handle: (id, action, ctx) => game.handle(id, action as MafiaAction, ctx),
      tick: (now) => game.tick(now),
      view: (id) => game.view(id),
      playerLeft: (id, now) => game.playerLeft(id, now),
      isOver: () => game.isOver(),
    };
  },
};

const tunedInGame: GameDefinition<tunedIn.DialConfig> = {
  info: {
    id: 'tunedin',
    name: 'Tuned In',
    tagline: 'One clue, one dial. How well does your crew read your mind?',
    minPlayers: tunedIn.MIN_PLAYERS.party,
    maxPlayers: tunedIn.MAX_PLAYERS,
    modes: tunedIn.MODES.map(({ id, name, description }) => ({ id, name, description })),
  },
  defaultConfig: () => ({ ...tunedIn.DEFAULT_CONFIG }),
  normalizeConfig: (raw, prev) => tunedIn.normalizeConfig(raw, prev),
  startError: tunedIn.validateConfig,
  create(opts) {
    const game = new tunedIn.TunedInGame(opts);
    return {
      handle: (id, action, ctx) => game.handle(id, action as tunedIn.DialAction, ctx),
      tick: (now) => game.tick(now),
      view: (id) => game.view(id),
      playerLeft: (id, now) => game.playerLeft(id, now),
      isOver: () => game.isOver(),
    };
  },
};

// Register new games here; lobbies, browsing and hosting work for all of them.
export const GAMES = new Map<string, GameDefinition<any>>([
  [mafia.info.id, mafia],
  [tunedInGame.info.id, tunedInGame],
]);
