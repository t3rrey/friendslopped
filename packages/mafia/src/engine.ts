import type {
  ChatChannel,
  ChatMessage,
  LogEntry,
  LogKind,
  MafiaAction,
  MafiaConfig,
  MafiaMode,
  MafiaView,
  NightActionKind,
  Phase,
  Role,
  Team,
} from './types.ts';

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 16;
export const SKIP = 'skip';
const CHAT_MAX = 280;
const CHAT_HISTORY = 300;

export const MODES: MafiaMode[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Standard pacing. Two minutes of daytime debate before the vote.',
    timings: { reveal: 15, night: 45, dawn: 8, day: 120, vote: 45, verdict: 8 },
  },
  {
    id: 'speed',
    name: 'Speed',
    description: 'Half-length phases for quick, chaotic rounds.',
    timings: { reveal: 10, night: 25, dawn: 5, day: 60, vote: 25, verdict: 5 },
  },
  {
    id: 'marathon',
    name: 'Marathon',
    description: 'Long days for groups who love to argue.',
    timings: { reveal: 20, night: 60, dawn: 10, day: 240, vote: 60, verdict: 10 },
  },
];

export const DEFAULT_CONFIG: MafiaConfig = { killers: 1, detectives: 1, healers: 1 };

export const ROLE_INFO: Record<Role, { name: string; team: Team; blurb: string }> = {
  killer: {
    name: 'Killer',
    team: 'killers',
    blurb: 'Each night, agree with your fellow killers on someone to eliminate. Blend in by day. You win once killers equal or outnumber the town.',
  },
  detective: {
    name: 'Detective',
    team: 'town',
    blurb: 'Each night, investigate one player to learn whether they are a killer. Use what you learn — carefully.',
  },
  healer: {
    name: 'Healer',
    team: 'town',
    blurb: 'Each night, protect one player (yourself included) from the killers. You cannot protect the same person two nights running.',
  },
  villager: {
    name: 'Villager',
    team: 'town',
    blurb: 'You have no night power. Read the room, find the killers and vote them out during the day.',
  },
};

export function getMode(id: string): MafiaMode {
  return MODES.find((m) => m.id === id) ?? MODES[0]!;
}

export function normalizeConfig(raw: unknown, prev: MafiaConfig = DEFAULT_CONFIG): MafiaConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = (key: keyof MafiaConfig, min: number) => {
    const v = src[key];
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(8, Math.max(min, Math.round(v))) : prev[key];
  };
  return { killers: pick('killers', 1), detectives: pick('detectives', 0), healers: pick('healers', 0) };
}

/** Returns a reason the game cannot start, or null. */
export function validateConfig(config: MafiaConfig, playerCount: number): string | null {
  if (playerCount < MIN_PLAYERS) return `Need at least ${MIN_PLAYERS} players (have ${playerCount}).`;
  if (playerCount > MAX_PLAYERS) return `At most ${MAX_PLAYERS} players.`;
  if (config.killers < 1) return 'Need at least one killer.';
  if (config.killers * 2 >= playerCount) return 'Killers must start outnumbered by the town.';
  if (config.killers + config.detectives + config.healers > playerCount) return 'More roles than players.';
  return null;
}

interface Seat {
  id: string;
  name: string;
  seat: number;
  role: Role;
  alive: boolean;
  ready: boolean;
  lastProtectedId: string | null;
}

export interface MafiaGameOptions {
  players: { id: string; name: string }[];
  config: MafiaConfig;
  modeId: string;
  now: number;
  random?: () => number;
}

/**
 * Authoritative Mafia rules. The rules never vary between games; only role
 * counts (config) and phase lengths (mode) are configurable.
 *
 * Night: killers pick a target (plurality; ties go to the earliest-seated
 *   killer's pick), healers protect, detectives investigate. All resolve at dawn.
 * Day: discussion, then a public vote. The top candidate is eliminated only
 *   with strictly more votes than any other choice, including "skip".
 * Win: town when no killers remain; killers once they equal or outnumber town.
 */
export class MafiaGame {
  readonly mode: MafiaMode;
  readonly config: MafiaConfig;
  phase: Phase = 'reveal';
  round = 0;
  phaseEndsAt = 0;
  winner: Team | null = null;
  private seats: Seat[];
  private nightPicks = new Map<string, string>();
  private votes = new Map<string, string>();
  private findings = new Map<string, Map<string, Team>>();
  private log: LogEntry[] = [];
  private chat: ChatMessage[] = [];
  private seq = 0;
  /** Log entries after this id are the latest dawn/verdict announcement. */
  private announcementFrom = 0;

  constructor(opts: MafiaGameOptions) {
    const error = validateConfig(opts.config, opts.players.length);
    if (error) throw new Error(error);
    this.mode = getMode(opts.modeId);
    this.config = opts.config;
    const random = opts.random ?? Math.random;

    const roles: Role[] = [
      ...Array<Role>(opts.config.killers).fill('killer'),
      ...Array<Role>(opts.config.detectives).fill('detective'),
      ...Array<Role>(opts.config.healers).fill('healer'),
    ];
    while (roles.length < opts.players.length) roles.push('villager');
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [roles[i], roles[j]] = [roles[j]!, roles[i]!];
    }

    this.seats = opts.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      seat: i,
      role: roles[i]!,
      alive: true,
      ready: false,
      lastProtectedId: null,
    }));
    const k = opts.config.killers;
    this.addLog('system', `The village gathers. ${k} killer${k === 1 ? ' hides' : 's hide'} among you.`);
    this.enter('reveal', opts.now);
  }

  // ---- queries -------------------------------------------------------------

  private seat(id: string) {
    return this.seats.find((s) => s.id === id);
  }

  private living() {
    return this.seats.filter((s) => s.alive);
  }

  private nightActionFor(s: Seat): NightActionKind | null {
    if (!s.alive) return null;
    if (s.role === 'killer') return 'kill';
    if (s.role === 'detective') return 'investigate';
    if (s.role === 'healer') return 'protect';
    return null;
  }

  private validTargets(s: Seat): string[] {
    const living = this.living();
    switch (this.nightActionFor(s)) {
      case 'kill':
        return living.filter((t) => t.role !== 'killer').map((t) => t.id);
      case 'investigate':
        return living.filter((t) => t.id !== s.id).map((t) => t.id);
      case 'protect':
        return living.filter((t) => t.id !== s.lastProtectedId).map((t) => t.id);
      default:
        return [];
    }
  }

  isOver() {
    return this.phase === 'gameOver';
  }

  // ---- phase flow ----------------------------------------------------------

  private enter(phase: Phase, now: number) {
    this.phase = phase;
    this.phaseEndsAt = phase === 'gameOver' ? 0 : now + this.mode.timings[phase] * 1000;
    for (const s of this.seats) s.ready = false;
    if (phase === 'night') {
      this.round += 1;
      this.nightPicks.clear();
      this.addLog('system', `Night ${this.round} falls. Everyone closes their eyes…`);
    }
    if (phase === 'vote') {
      this.votes.clear();
      this.addLog('system', 'Voting is open. Pick someone to eliminate, or skip.');
    }
  }

  /** Advances phases whose timer has run out. Returns true if state changed. */
  tick(now: number): boolean {
    if (this.phase === 'gameOver' || now < this.phaseEndsAt) return false;
    this.advance(now);
    return true;
  }

  private advance(now: number) {
    switch (this.phase) {
      case 'reveal':
        return this.enter('night', now);
      case 'night':
        this.announcementFrom = this.seq;
        this.resolveNight();
        return this.enter('dawn', now);
      case 'dawn':
        return this.winner ? this.enter('gameOver', now) : this.enter('day', now);
      case 'day':
        return this.enter('vote', now);
      case 'vote':
        this.announcementFrom = this.seq;
        this.resolveVote();
        return this.enter('verdict', now);
      case 'verdict':
        return this.winner ? this.enter('gameOver', now) : this.enter('night', now);
      case 'gameOver':
        return;
    }
  }

  private advanceIfComplete(now: number) {
    const living = this.living();
    let done = false;
    if (this.phase === 'reveal' || this.phase === 'day') done = living.every((s) => s.ready);
    if (this.phase === 'vote') done = living.every((s) => this.votes.has(s.id));
    if (this.phase === 'night') {
      done = living.every((s) => !this.nightActionFor(s) || this.nightPicks.has(s.id));
    }
    if (done) this.advance(now);
  }

  private resolveNight() {
    const living = this.living();

    // Killers: plurality vote, ties broken by the earliest-seated killer's pick.
    const killers = living.filter((s) => s.role === 'killer');
    const tally = new Map<string, number>();
    for (const k of killers) {
      const t = this.nightPicks.get(k.id);
      if (t) tally.set(t, (tally.get(t) ?? 0) + 1);
    }
    let victimId: string | null = null;
    if (tally.size > 0) {
      const top = Math.max(...tally.values());
      const tied = new Set([...tally].filter(([, n]) => n === top).map(([id]) => id));
      victimId = killers.map((k) => this.nightPicks.get(k.id)).find((t) => t && tied.has(t)) ?? null;
    }

    const protectedIds = new Set<string>();
    for (const h of living.filter((s) => s.role === 'healer')) {
      const t = this.nightPicks.get(h.id) ?? null;
      h.lastProtectedId = t;
      if (t) protectedIds.add(t);
    }

    for (const d of living.filter((s) => s.role === 'detective')) {
      const target = this.seat(this.nightPicks.get(d.id) ?? '');
      if (!target) continue;
      const team = ROLE_INFO[target.role].team;
      let known = this.findings.get(d.id);
      if (!known) this.findings.set(d.id, (known = new Map()));
      known.set(target.id, team);
      this.addLog(
        'investigation',
        `Your investigation reveals ${target.name} is ${team === 'killers' ? 'a KILLER' : 'innocent'}.`,
        [d.id],
      );
    }

    const victim = victimId ? this.seat(victimId) : undefined;
    if (victim && protectedIds.has(victim.id)) {
      this.addLog('save', 'The killers struck in the night — but a healer got there first. Nobody died.');
      const savers = living.filter((s) => s.role === 'healer' && this.nightPicks.get(s.id) === victim.id);
      this.addLog('save', `You saved ${victim.name}'s life.`, savers.map((s) => s.id));
    } else if (victim) {
      this.kill(victim, `${victim.name} was found dead at dawn. They were a ${ROLE_INFO[victim.role].name}.`);
    } else {
      this.addLog('system', 'A quiet night. Nobody died.');
    }
  }

  private resolveVote() {
    const tally = new Map<string, number>();
    for (const t of this.votes.values()) tally.set(t, (tally.get(t) ?? 0) + 1);
    const ranked = [...tally].sort((a, b) => b[1] - a[1]);
    const [first, second] = ranked;
    const summary = ranked
      .map(([id, n]) => `${id === SKIP ? 'Skip' : (this.seat(id)?.name ?? '?')} ${n}`)
      .join(', ');
    this.addLog('vote', summary ? `Votes — ${summary}.` : 'Nobody voted.');

    if (!first || first[0] === SKIP || (second && second[1] === first[1])) {
      this.addLog('system', 'No majority. Nobody is eliminated today.');
      return;
    }
    const target = this.seat(first[0])!;
    this.kill(target, `The town has spoken: ${target.name} is eliminated. They were a ${ROLE_INFO[target.role].name}.`);
  }

  private kill(s: Seat, message: string) {
    s.alive = false;
    this.addLog('death', message);
    this.checkWin();
  }

  private checkWin() {
    if (this.winner) return;
    const living = this.living();
    const killers = living.filter((s) => s.role === 'killer').length;
    const town = living.length - killers;
    if (killers === 0) this.winner = 'town';
    else if (killers >= town) this.winner = 'killers';
    if (this.winner) {
      this.addLog(
        'win',
        this.winner === 'town' ? 'Every killer has been found. The town wins!' : 'The killers have taken over the village. Killers win!',
      );
    }
  }

  // ---- input ---------------------------------------------------------------

  /** Applies a player's action. Returns an error message, or null on success. */
  handle(playerId: string, action: MafiaAction, ctx: { now: number; isHost: boolean }): string | null {
    const me = this.seat(playerId);
    if (!me) return 'You are not in this game.';
    if (!action || typeof action !== 'object') return 'Bad action.';

    switch (action.type) {
      case 'chat': {
        const text = typeof action.text === 'string' ? action.text.trim().slice(0, CHAT_MAX) : '';
        if (!text) return null;
        if (!this.canChat(me).includes(action.channel)) return "You can't talk there right now.";
        this.chat.push({ id: ++this.seq, channel: action.channel, fromId: me.id, fromName: me.name, text });
        if (this.chat.length > CHAT_HISTORY) this.chat.shift();
        return null;
      }
      case 'advance': {
        if (!ctx.isHost) return 'Only the host can skip ahead.';
        if (this.phase === 'gameOver') return null;
        this.advance(ctx.now);
        return null;
      }
      case 'ready': {
        if (this.phase !== 'reveal' && this.phase !== 'day') return null;
        if (this.phase === 'day' && !me.alive) return null;
        me.ready = true;
        this.advanceIfComplete(ctx.now);
        return null;
      }
      case 'nightTarget': {
        if (this.phase !== 'night') return "It isn't night.";
        if (!this.nightActionFor(me)) return 'You have no night action.';
        if (action.targetId === null) {
          this.nightPicks.delete(me.id);
          return null;
        }
        if (!this.validTargets(me).includes(action.targetId)) return "You can't target that player.";
        this.nightPicks.set(me.id, action.targetId);
        this.advanceIfComplete(ctx.now);
        return null;
      }
      case 'vote': {
        if (this.phase !== 'vote') return 'Voting is not open.';
        if (!me.alive) return 'The dead cannot vote.';
        if (action.targetId === null) {
          this.votes.delete(me.id);
          return null;
        }
        const target = action.targetId === SKIP ? null : this.seat(action.targetId);
        if (action.targetId !== SKIP && (!target || !target.alive)) return "You can't vote for that player.";
        this.votes.set(me.id, action.targetId);
        this.advanceIfComplete(ctx.now);
        return null;
      }
      default:
        return 'Unknown action.';
    }
  }

  /** A player abandoned the game: they die with their role revealed. */
  playerLeft(playerId: string, now: number) {
    const s = this.seat(playerId);
    if (!s || !s.alive || this.phase === 'gameOver') return;
    this.nightPicks.delete(s.id);
    this.votes.delete(s.id);
    for (const [voter, target] of this.votes) if (target === s.id) this.votes.delete(voter);
    for (const [actor, target] of this.nightPicks) if (target === s.id) this.nightPicks.delete(actor);
    if (this.phase !== 'dawn' && this.phase !== 'verdict') this.announcementFrom = this.seq;
    this.kill(s, `${s.name} fled the village. They were a ${ROLE_INFO[s.role].name}.`);
    if (this.winner && this.phase !== 'dawn' && this.phase !== 'verdict') this.enter('gameOver', now);
    else this.advanceIfComplete(now);
  }

  // ---- views ---------------------------------------------------------------

  private canChat(s: Seat): ChatChannel[] {
    if (this.phase === 'gameOver') return ['town'];
    if (!s.alive) return ['dead'];
    const channels: ChatChannel[] = this.phase === 'night' ? [] : ['town'];
    if (s.role === 'killer') channels.push('killers');
    return channels;
  }

  private readChannels(s: Seat): ChatChannel[] {
    if (this.phase === 'gameOver' || !s.alive) return ['town', 'killers', 'dead'];
    return s.role === 'killer' ? ['town', 'killers'] : ['town'];
  }

  view(playerId: string): MafiaView {
    const me = this.seat(playerId) ?? this.seats[0]!;
    const over = this.phase === 'gameOver';
    // The dead become spectators and see everything.
    const omniscient = over || !me.alive;
    const known = this.findings.get(me.id);
    const action = this.phase === 'night' ? this.nightActionFor(me) : null;
    const read = this.readChannels(me);
    const log = this.log.filter((e) => !e.visibleTo || omniscient || e.visibleTo.includes(me.id));

    return {
      phase: this.phase,
      round: this.round,
      phaseEndsAt: this.phaseEndsAt,
      mode: this.mode,
      config: this.config,
      meId: me.id,
      myRole: me.role,
      myAlive: me.alive,
      winner: over ? this.winner : null,
      players: this.seats.map((s) => ({
        id: s.id,
        name: s.name,
        seat: s.seat,
        alive: s.alive,
        ready: s.ready,
        role:
          omniscient || s.id === me.id || !s.alive || (me.role === 'killer' && s.role === 'killer') ? s.role : null,
        investigated: known?.get(s.id) ?? null,
      })),
      night: action
        ? {
            action,
            targetId: this.nightPicks.get(me.id) ?? null,
            validTargetIds: this.validTargets(me),
            allyPicks:
              me.role === 'killer'
                ? this.living()
                    .filter((s) => s.role === 'killer' && s.id !== me.id)
                    .map((s) => ({ playerId: s.id, targetId: this.nightPicks.get(s.id) ?? null }))
                : [],
          }
        : null,
      votes: this.phase === 'vote' || this.phase === 'verdict'
        ? [...this.votes].map(([voterId, targetId]) => ({ voterId, targetId }))
        : [],
      log,
      announcement: this.phase === 'dawn' || this.phase === 'verdict' || over
        ? log.filter((e) => e.id > this.announcementFrom && e.kind !== 'vote')
        : [],
      chat: this.chat.filter((m) => read.includes(m.channel)),
      canChat: this.canChat(me),
      readChannels: read,
    };
  }

  private addLog(kind: LogKind, text: string, visibleTo?: string[]) {
    this.log.push({ id: ++this.seq, round: this.round, phase: this.phase, kind, text, visibleTo });
  }
}
