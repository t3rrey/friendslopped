import { randomBytes, randomUUID } from 'node:crypto';
import {
  cleanName,
  LOBBY_NAME_MAX,
  type ClientMessage,
  type LobbyState,
  type LobbySummary,
  type ServerMessage,
} from '@friendslopped/shared';
import { GAMES } from './games/index.ts';
import type { GameDefinition, GameInstance } from './games/types.ts';

export interface Connection {
  send(msg: ServerMessage): void;
}

interface Session {
  id: string;
  token: string;
  name: string;
  conns: Set<Connection>;
  lobbyCode: string | null;
  disconnectedAt: number | null;
}

interface Lobby {
  code: string;
  name: string;
  def: GameDefinition;
  modeId: string;
  hostId: string;
  isPrivate: boolean;
  playerIds: string[];
  colors: Map<string, number>;
  config: unknown;
  game: GameInstance | null;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
/** Drop a disconnected player from a waiting lobby after this long. */
const WAITING_GRACE_MS = 2 * 60_000;
/** Drop a disconnected player from a running game after this long. */
const PLAYING_GRACE_MS = 5 * 60_000;
const COLOR_COUNT = 12;

/** Owns every session and lobby. Transport-agnostic so it is easy to test. */
export class Hub {
  private sessions = new Map<string, Session>();
  private byToken = new Map<string, Session>();
  private lobbies = new Map<string, Lobby>();

  constructor(private now: () => number = Date.now) {}

  // ---- connection lifecycle ------------------------------------------------

  /** Returns the session the connection is bound to after a hello. */
  hello(conn: Connection, msg: Extract<ClientMessage, { type: 'hello' }>): Session {
    let s = msg.sessionToken ? this.byToken.get(msg.sessionToken) : undefined;
    if (!s) {
      s = { id: randomUUID(), token: randomBytes(18).toString('base64url'), name: '', conns: new Set(), lobbyCode: null, disconnectedAt: null };
      this.sessions.set(s.id, s);
      this.byToken.set(s.token, s);
    }
    s.name = cleanName(msg.name) || s.name || `Player ${s.id.slice(0, 3).toUpperCase()}`;
    s.conns.add(conn);
    s.disconnectedAt = null;
    conn.send({ type: 'welcome', playerId: s.id, sessionToken: s.token, name: s.name, games: [...GAMES.values()].map((g) => g.info) });
    const lobby = this.lobbyOf(s);
    if (lobby) this.broadcastLobby(lobby);
    else {
      conn.send({ type: 'lobby', lobby: null, serverNow: this.now() });
      conn.send({ type: 'lobbies', lobbies: this.summaries() });
    }
    return s;
  }

  disconnect(s: Session, conn: Connection) {
    s.conns.delete(conn);
    if (s.conns.size > 0) return;
    s.disconnectedAt = this.now();
    const lobby = this.lobbyOf(s);
    if (lobby) this.broadcastLobby(lobby);
  }

  /** Periodic housekeeping: game timers and abandoned players. */
  tick() {
    const now = this.now();
    for (const lobby of [...this.lobbies.values()]) {
      if (lobby.game?.tick(now)) this.broadcastLobby(lobby);
    }
    for (const s of this.sessions.values()) {
      if (s.disconnectedAt === null) continue;
      const lobby = this.lobbyOf(s);
      const grace = lobby?.game && !lobby.game.isOver() ? PLAYING_GRACE_MS : WAITING_GRACE_MS;
      if (now - s.disconnectedAt < grace) continue;
      if (lobby) this.leave(s);
      this.sessions.delete(s.id);
      this.byToken.delete(s.token);
    }
  }

  // ---- messages ------------------------------------------------------------

  handle(s: Session, msg: ClientMessage, conn: Connection) {
    const fail = (message: string) => conn.send({ type: 'error', message });
    const lobby = this.lobbyOf(s);
    const isHost = lobby?.hostId === s.id;

    switch (msg.type) {
      case 'hello':
        return;
      case 'setName': {
        const name = cleanName(msg.name);
        if (!name) return fail('Pick a name first.');
        if (lobby?.game) return fail("You can't rename mid-game.");
        s.name = name;
        if (lobby) this.broadcastLobby(lobby);
        return;
      }
      case 'listLobbies':
        return conn.send({ type: 'lobbies', lobbies: this.summaries() });

      case 'createLobby': {
        const def = GAMES.get(msg.gameId);
        if (!def) return fail('Unknown game.');
        if (lobby) this.leave(s);
        const code = this.newCode();
        const created: Lobby = {
          code,
          name: cleanName(msg.name, LOBBY_NAME_MAX) || `${s.name}'s ${def.info.name}`,
          def,
          modeId: def.info.modes.some((m) => m.id === msg.modeId) ? msg.modeId : def.info.modes[0]!.id,
          hostId: s.id,
          isPrivate: !!msg.isPrivate,
          playerIds: [],
          colors: new Map(),
          config: def.defaultConfig(),
          game: null,
        };
        this.lobbies.set(code, created);
        this.join(s, created);
        return;
      }
      case 'joinLobby': {
        const target = this.lobbies.get(String(msg.code).trim().toUpperCase());
        if (!target) return fail('No lobby with that code.');
        if (target === lobby) return;
        if (target.game) return fail('That game is already in progress.');
        if (target.playerIds.length >= target.def.info.maxPlayers) return fail('That lobby is full.');
        if (lobby) this.leave(s);
        this.join(s, target);
        return;
      }
      case 'leaveLobby':
        if (lobby) this.leave(s);
        return;

      case 'updateLobby': {
        if (!lobby || !isHost) return fail('Only the host can change settings.');
        if (lobby.game) return fail('Settings are locked during a game.');
        if (msg.modeId && lobby.def.info.modes.some((m) => m.id === msg.modeId)) lobby.modeId = msg.modeId;
        if (msg.config !== undefined) lobby.config = lobby.def.normalizeConfig(msg.config, lobby.config);
        if (msg.name !== undefined) lobby.name = cleanName(msg.name, LOBBY_NAME_MAX) || lobby.name;
        if (msg.isPrivate !== undefined) lobby.isPrivate = !!msg.isPrivate;
        this.broadcastLobby(lobby);
        this.broadcastSummaries();
        return;
      }
      case 'kick': {
        if (!lobby || !isHost) return fail('Only the host can kick.');
        const target = this.sessions.get(msg.playerId);
        if (!target || target.lobbyCode !== lobby.code || target.id === s.id) return;
        this.leave(target);
        for (const c of target.conns) c.send({ type: 'kicked' });
        return;
      }
      case 'startGame': {
        if (!lobby || !isHost) return fail('Only the host can start.');
        if (lobby.game) return;
        const error = lobby.def.startError(lobby.config, lobby.playerIds.length);
        if (error) return fail(error);
        lobby.game = lobby.def.create({
          players: lobby.playerIds.map((id) => ({ id, name: this.sessions.get(id)!.name })),
          config: lobby.config,
          modeId: lobby.modeId,
          now: this.now(),
        });
        this.broadcastLobby(lobby);
        this.broadcastSummaries();
        return;
      }
      case 'returnToLobby': {
        if (!lobby || !isHost) return fail('Only the host can do that.');
        if (lobby.game && !lobby.game.isOver()) return fail('The game is still running.');
        lobby.game = null;
        this.broadcastLobby(lobby);
        this.broadcastSummaries();
        return;
      }
      case 'gameAction': {
        if (!lobby?.game) return fail('No game running.');
        const error = lobby.game.handle(s.id, msg.action, { now: this.now(), isHost });
        if (error) fail(error);
        this.broadcastLobby(lobby);
        return;
      }
    }
  }

  // ---- lobby helpers -------------------------------------------------------

  private lobbyOf(s: Session) {
    return s.lobbyCode ? this.lobbies.get(s.lobbyCode) : undefined;
  }

  private join(s: Session, lobby: Lobby) {
    s.lobbyCode = lobby.code;
    lobby.playerIds.push(s.id);
    const used = new Set(lobby.colors.values());
    let color = 0;
    while (used.has(color) && color < COLOR_COUNT) color++;
    lobby.colors.set(s.id, color % COLOR_COUNT);
    this.broadcastLobby(lobby);
    this.broadcastSummaries();
  }

  private leave(s: Session) {
    const lobby = this.lobbyOf(s);
    s.lobbyCode = null;
    for (const c of s.conns) {
      c.send({ type: 'lobby', lobby: null, serverNow: this.now() });
      c.send({ type: 'lobbies', lobbies: this.summaries() });
    }
    if (!lobby) return;
    lobby.playerIds = lobby.playerIds.filter((id) => id !== s.id);
    lobby.colors.delete(s.id);
    lobby.game?.playerLeft(s.id, this.now());
    if (lobby.playerIds.length === 0) {
      this.lobbies.delete(lobby.code);
    } else {
      if (lobby.hostId === s.id) {
        const next =
          lobby.playerIds.find((id) => this.sessions.get(id)?.conns.size) ?? lobby.playerIds[0]!;
        lobby.hostId = next;
      }
      this.broadcastLobby(lobby);
    }
    this.broadcastSummaries();
  }

  private newCode() {
    let code: string;
    do {
      code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
    } while (this.lobbies.has(code));
    return code;
  }

  private stateFor(lobby: Lobby, viewerId: string): LobbyState {
    return {
      code: lobby.code,
      name: lobby.name,
      gameId: lobby.def.info.id,
      modeId: lobby.modeId,
      hostId: lobby.hostId,
      isPrivate: lobby.isPrivate,
      status: lobby.game ? 'playing' : 'waiting',
      maxPlayers: lobby.def.info.maxPlayers,
      players: lobby.playerIds.map((id) => {
        const p = this.sessions.get(id)!;
        return { id, name: p.name, color: lobby.colors.get(id) ?? 0, connected: p.conns.size > 0, isHost: id === lobby.hostId };
      }),
      config: lobby.config,
      startError: lobby.def.startError(lobby.config, lobby.playerIds.length),
      game: lobby.game ? lobby.game.view(viewerId) : null,
    };
  }

  private broadcastLobby(lobby: Lobby) {
    const serverNow = this.now();
    for (const id of lobby.playerIds) {
      const s = this.sessions.get(id);
      if (!s?.conns.size) continue;
      const msg: ServerMessage = { type: 'lobby', lobby: this.stateFor(lobby, id), serverNow };
      for (const c of s.conns) c.send(msg);
    }
  }

  private summaries(): LobbySummary[] {
    return [...this.lobbies.values()]
      .filter((l) => !l.isPrivate)
      .map((l) => ({
        code: l.code,
        name: l.name,
        gameId: l.def.info.id,
        modeId: l.modeId,
        hostName: this.sessions.get(l.hostId)?.name ?? '?',
        playerCount: l.playerIds.length,
        maxPlayers: l.def.info.maxPlayers,
        status: l.game ? 'playing' : 'waiting',
      }));
  }

  /** Keeps the lobby browser live for everyone not currently in a lobby. */
  private broadcastSummaries() {
    const msg: ServerMessage = { type: 'lobbies', lobbies: this.summaries() };
    for (const s of this.sessions.values()) {
      if (s.lobbyCode) continue;
      for (const c of s.conns) c.send(msg);
    }
  }
}
