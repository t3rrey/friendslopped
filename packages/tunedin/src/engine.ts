import type { DialAction, DialConfig, DialMode, DialModeId, DialPhase, DialView, Side, Spectrum, Team } from './types.ts';
import { SPECTRUMS } from './spectrums.ts';

export const MAX_PLAYERS = 16;
export const MIN_PLAYERS: Record<DialModeId, number> = { party: 3, teams: 4 };
const CLUE_MAX = 60;

export const MODES: DialMode[] = [
  {
    id: 'party',
    name: 'Party',
    description: 'Everyone gets their own dial. The psychic scores when the room reads them well.',
    timings: { clue: 90, guess: 60, counter: 0, reveal: 12 },
  },
  {
    id: 'teams',
    name: 'Teams',
    description: 'Two teams share a dial and race to the target score. The other team calls left or right to steal a point.',
    timings: { clue: 90, guess: 90, counter: 30, reveal: 12 },
  },
];

export const DEFAULT_CONFIG: DialConfig = { psychicTurns: 1, targetScore: 10 };
export const TEAM_NAMES = ['Red Team', 'Blue Team'] as const;

/** Scoring bands, as half-widths on the 0–100 dial: bullseye 4, then 3, then 2. */
export const BANDS = [
  { points: 4, half: 2.5 },
  { points: 3, half: 7.5 },
  { points: 2, half: 12.5 },
] as const;

export function scoreFor(guess: number, target: number): number {
  const d = Math.abs(guess - target);
  return BANDS.find((b) => d <= b.half)?.points ?? 0;
}

export function getMode(id: string): DialMode {
  return MODES.find((m) => m.id === id) ?? MODES[0]!;
}

export function normalizeConfig(raw: unknown, prev: DialConfig = DEFAULT_CONFIG): DialConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = (key: keyof DialConfig, min: number, max: number) => {
    const v = src[key];
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : prev[key];
  };
  return { psychicTurns: pick('psychicTurns', 1, 3), targetScore: pick('targetScore', 5, 20) };
}

export function validateConfig(_config: DialConfig, playerCount: number, modeId: string): string | null {
  const mode = getMode(modeId);
  const min = MIN_PLAYERS[mode.id];
  if (playerCount < min) return `${mode.name} mode needs at least ${min} players (have ${playerCount}).`;
  if (playerCount > MAX_PLAYERS) return `At most ${MAX_PLAYERS} players.`;
  return null;
}

interface Seat {
  id: string;
  name: string;
  seat: number;
  team: Team | null;
  score: number;
  guess: number | null;
  locked: boolean;
  ready: boolean;
  roundPoints: number | null;
  gone: boolean;
}

export interface TunedInOptions {
  players: { id: string; name: string }[];
  config: DialConfig;
  modeId: string;
  now: number;
  random?: () => number;
}

/**
 * Wavelength-style guessing game. The psychic sees a hidden target on a
 * spectrum between two opposites ("Cold ↔ Hot") and gives a one-line clue.
 * Everyone else turns a dial to where they think the target is.
 *
 * Party: each guesser scores 4/3/2 by closeness; the psychic earns the
 *   rounded average. Everyone is psychic `psychicTurns` times.
 * Teams: the active team shares one dial; the other team then calls whether
 *   the target is left or right of it for 1 point (no steal on a bullseye).
 *   First team to `targetScore` at the end of a round wins; ties play on.
 */
export class TunedInGame {
  readonly mode: DialMode;
  readonly config: DialConfig;
  phase: DialPhase = 'clue';
  round = 0;
  phaseEndsAt = 0;
  private seats: Seat[];
  private random: () => number;
  private deck: Spectrum[];
  private psychicId = '';
  private spectrum: Spectrum = SPECTRUMS[0]!;
  private target = 50;
  private clue: string | null = null;
  private rerolled = false;
  private activeTeam: Team = 0;
  private teamScores: [number, number] = [0, 0];
  private teamPsychicIdx: [number, number] = [0, 0];
  private teamDial = 50;
  private counter: Side | null = null;
  private result: DialView['result'] = null;
  private psychicOrder: string[] = [];

  constructor(opts: TunedInOptions) {
    const error = validateConfig(opts.config, opts.players.length, opts.modeId);
    if (error) throw new Error(error);
    this.mode = getMode(opts.modeId);
    this.config = opts.config;
    this.random = opts.random ?? Math.random;
    this.deck = this.shuffle([...SPECTRUMS]);

    // Teams are dealt from a shuffled seat order so they differ each game.
    const order = this.shuffle(opts.players.map((_, i) => i));
    this.seats = opts.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      seat: i,
      team: this.mode.id === 'teams' ? ((order.indexOf(i) % 2) as Team) : null,
      score: 0,
      guess: null,
      locked: false,
      ready: false,
      roundPoints: null,
      gone: false,
    }));
    for (let t = 0; t < this.config.psychicTurns; t++) this.psychicOrder.push(...this.seats.map((s) => s.id));
    this.startRound(opts.now);
  }

  private shuffle<T>(xs: T[]): T[] {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [xs[i], xs[j]] = [xs[j]!, xs[i]!];
    }
    return xs;
  }

  private seat(id: string) {
    return this.seats.find((s) => s.id === id);
  }

  private present() {
    return this.seats.filter((s) => !s.gone);
  }

  private teamMembers(team: Team) {
    return this.present().filter((s) => s.team === team);
  }

  private guessers() {
    return this.present().filter(
      (s) => s.id !== this.psychicId && (this.mode.id === 'party' || s.team === this.activeTeam),
    );
  }

  private get totalRounds() {
    return this.psychicOrder.length;
  }

  isOver() {
    return this.phase === 'gameOver';
  }

  // ---- flow ----------------------------------------------------------------

  private enter(phase: DialPhase, now: number) {
    this.phase = phase;
    this.phaseEndsAt = phase === 'gameOver' ? 0 : now + this.mode.timings[phase] * 1000;
    for (const s of this.seats) s.ready = false;
  }

  private drawSpectrum() {
    if (this.deck.length === 0) this.deck = this.shuffle([...SPECTRUMS]);
    return this.deck.pop()!;
  }

  private startRound(now: number) {
    if (this.mode.id === 'party') {
      // Skip psychics who have left.
      let next: Seat | undefined;
      while (this.round < this.totalRounds && !next) {
        const candidate = this.seat(this.psychicOrder[this.round]!);
        this.round++;
        if (candidate && !candidate.gone) next = candidate;
      }
      if (!next) return this.enter('gameOver', now);
      this.psychicId = next.id;
    } else {
      this.round++;
      const members = this.teamMembers(this.activeTeam);
      const idx = this.teamPsychicIdx[this.activeTeam]++ % members.length;
      this.psychicId = members[idx]!.id;
    }
    this.spectrum = this.drawSpectrum();
    this.target = 5 + Math.round(this.random() * 90);
    this.clue = null;
    this.rerolled = false;
    this.teamDial = 50;
    this.counter = null;
    this.result = null;
    for (const s of this.seats) {
      s.guess = null;
      s.locked = false;
      s.roundPoints = null;
    }
    this.enter('clue', now);
  }

  tick(now: number): boolean {
    if (this.phase === 'gameOver' || now < this.phaseEndsAt) return false;
    this.advance(now);
    return true;
  }

  private advance(now: number) {
    switch (this.phase) {
      case 'clue':
        if (!this.clue) {
          this.result = { lines: [`${this.seat(this.psychicId)?.name} ran out of time. No points this round.`], teamPoints: null };
          return this.enter('reveal', now);
        }
        return this.enter('guess', now);
      case 'guess':
        if (this.mode.id === 'teams') return this.enter('counter', now);
        this.resolve();
        return this.enter('reveal', now);
      case 'counter':
        this.resolve();
        return this.enter('reveal', now);
      case 'reveal':
        return this.endOfRound(now);
      case 'gameOver':
        return;
    }
  }

  private endOfRound(now: number) {
    if (this.mode.id === 'teams') {
      const [a, b] = this.teamScores;
      const reached = Math.max(a, b) >= this.config.targetScore && a !== b;
      const emptyTeam = this.teamMembers(0).length === 0 || this.teamMembers(1).length === 0;
      if (reached || emptyTeam) return this.enter('gameOver', now);
      this.activeTeam = (1 - this.activeTeam) as Team;
      return this.startRound(now);
    }
    if (this.round >= this.totalRounds || this.present().length < 2) return this.enter('gameOver', now);
    this.startRound(now);
  }

  private resolve() {
    const psychic = this.seat(this.psychicId)!;
    const lines: string[] = [];

    if (this.mode.id === 'party') {
      const guessers = this.guessers();
      let total = 0;
      for (const g of guessers) {
        const pts = g.guess === null ? 0 : scoreFor(g.guess, this.target);
        g.roundPoints = pts;
        g.score += pts;
        total += pts;
      }
      const psychicPts = guessers.length ? Math.round(total / guessers.length) : 0;
      psychic.roundPoints = psychicPts;
      psychic.score += psychicPts;
      const bullseyes = guessers.filter((g) => g.roundPoints === 4).map((g) => g.name);
      if (bullseyes.length) lines.push(`Bullseye! ${bullseyes.join(', ')}`);
      lines.push(`${psychic.name} earns ${psychicPts} as psychic.`);
      this.result = { lines, teamPoints: null };
      return;
    }

    const team = this.activeTeam;
    const other = (1 - team) as Team;
    const pts = scoreFor(this.teamDial, this.target);
    this.teamScores[team] += pts;
    lines.push(pts === 4 ? `BULLSEYE! ${TEAM_NAMES[team]} score 4.` : `${TEAM_NAMES[team]} score ${pts}.`);
    if (pts !== 4 && this.counter) {
      const actual: Side | null = this.target < this.teamDial ? 'left' : this.target > this.teamDial ? 'right' : null;
      if (actual === this.counter) {
        this.teamScores[other] += 1;
        lines.push(`${TEAM_NAMES[other]} called ${this.counter} correctly and steal 1.`);
      } else {
        lines.push(`${TEAM_NAMES[other]} called ${this.counter}. No steal.`);
      }
    }
    this.result = { lines, teamPoints: pts };
  }

  private advanceIfComplete(now: number) {
    if (this.phase === 'guess' && this.mode.id === 'party' && this.guessers().every((g) => g.locked)) this.advance(now);
    else if (this.phase === 'reveal' && this.present().every((s) => s.ready)) this.advance(now);
  }

  // ---- input ---------------------------------------------------------------

  handle(playerId: string, action: DialAction, ctx: { now: number; isHost: boolean }): string | null {
    const me = this.seat(playerId);
    if (!me || me.gone) return 'You are not in this game.';
    if (!action || typeof action !== 'object') return 'Bad action.';
    const isPsychic = me.id === this.psychicId;

    switch (action.type) {
      case 'advance':
        if (!ctx.isHost) return 'Only the host can skip ahead.';
        if (this.phase !== 'gameOver') this.advance(ctx.now);
        return null;

      case 'clue': {
        if (this.phase !== 'clue' || !isPsychic) return 'Only the psychic gives the clue.';
        const text = typeof action.text === 'string' ? action.text.replace(/\s+/g, ' ').trim().slice(0, CLUE_MAX) : '';
        if (!text) return 'Type a clue first.';
        this.clue = text;
        this.enter('guess', ctx.now);
        return null;
      }
      case 'reroll':
        if (this.phase !== 'clue' || !isPsychic) return 'Only the psychic can swap the card.';
        if (this.rerolled) return 'You already swapped this round.';
        this.rerolled = true;
        this.spectrum = this.drawSpectrum();
        this.target = 5 + Math.round(this.random() * 90);
        return null;

      case 'dial': {
        if (this.phase !== 'guess') return null;
        if (!this.guessers().includes(me)) return "It's not your turn to guess.";
        const value = typeof action.value === 'number' && Number.isFinite(action.value) ? action.value : 50;
        const clamped = Math.round(Math.min(100, Math.max(0, value)) * 2) / 2;
        if (this.mode.id === 'teams') this.teamDial = clamped;
        else if (!me.locked) me.guess = clamped;
        return null;
      }
      case 'lock': {
        if (this.phase !== 'guess' || !this.guessers().includes(me)) return null;
        if (this.mode.id === 'teams') {
          this.enter('counter', ctx.now);
          return null;
        }
        me.guess ??= 50;
        me.locked = true;
        this.advanceIfComplete(ctx.now);
        return null;
      }
      case 'counter': {
        if (this.phase !== 'counter') return null;
        if (me.team === this.activeTeam) return 'The other team makes this call.';
        if (action.side !== 'left' && action.side !== 'right') return 'Pick left or right.';
        this.counter = action.side;
        this.resolve();
        this.enter('reveal', ctx.now);
        return null;
      }
      case 'ready':
        if (this.phase !== 'reveal') return null;
        me.ready = true;
        this.advanceIfComplete(ctx.now);
        return null;

      default:
        return 'Unknown action.';
    }
  }

  playerLeft(playerId: string, now: number) {
    const s = this.seat(playerId);
    if (!s || s.gone || this.phase === 'gameOver') return;
    s.gone = true;
    const teamEmpty = this.mode.id === 'teams' && s.team !== null && this.teamMembers(s.team).length === 0;
    if (this.present().length < 2 || teamEmpty) return this.enter('gameOver', now);
    if (s.id === this.psychicId && this.phase !== 'reveal') {
      this.result = { lines: [`${s.name} (the psychic) left. Round skipped.`], teamPoints: null };
      return this.enter('reveal', now);
    }
    if (this.mode.id === 'teams' && this.phase === 'guess' && this.guessers().length === 0) return this.enter('counter', now);
    this.advanceIfComplete(now);
  }

  // ---- views ---------------------------------------------------------------

  private winners(): { ids: string[]; team: Team | null } {
    if (this.phase !== 'gameOver') return { ids: [], team: null };
    if (this.mode.id === 'teams') {
      const [a, b] = this.teamScores;
      const emptyA = this.teamMembers(0).length === 0;
      const emptyB = this.teamMembers(1).length === 0;
      const team: Team | null = emptyA && !emptyB ? 1 : emptyB && !emptyA ? 0 : a === b ? null : a > b ? 0 : 1;
      return { ids: team === null ? [] : this.seats.filter((s) => s.team === team).map((s) => s.id), team };
    }
    const best = Math.max(...this.present().map((s) => s.score));
    return { ids: this.present().filter((s) => s.score === best).map((s) => s.id), team: null };
  }

  view(playerId: string): DialView {
    const me = this.seat(playerId) ?? this.seats[0]!;
    const revealed = this.phase === 'reveal' || this.phase === 'gameOver';
    const showTarget = revealed || (me.id === this.psychicId && this.result === null);
    const winners = this.winners();
    return {
      mode: this.mode,
      config: this.config,
      phase: this.phase,
      round: this.round,
      totalRounds: this.mode.id === 'party' ? this.totalRounds : null,
      phaseEndsAt: this.phaseEndsAt,
      meId: me.id,
      psychicId: this.psychicId,
      activeTeam: this.mode.id === 'teams' ? this.activeTeam : null,
      spectrum: this.spectrum,
      clue: this.clue,
      target: showTarget ? this.target : null,
      canReroll: this.phase === 'clue' && me.id === this.psychicId && !this.rerolled,
      players: this.seats.map((s) => ({
        id: s.id,
        name: s.name,
        seat: s.seat,
        team: s.team,
        score: s.score,
        locked: s.locked,
        ready: s.ready,
        guess: revealed || s.id === me.id ? s.guess : null,
        roundPoints: revealed ? s.roundPoints : null,
        gone: s.gone,
      })),
      teams: this.mode.id === 'teams' ? TEAM_NAMES.map((name, i) => ({ name, score: this.teamScores[i]! })) : [],
      teamDial: this.mode.id === 'teams' && this.phase !== 'clue' ? this.teamDial : null,
      counter: this.counter,
      result: revealed ? this.result : null,
      winnerIds: winners.ids,
      winnerTeam: winners.team,
    };
  }
}
