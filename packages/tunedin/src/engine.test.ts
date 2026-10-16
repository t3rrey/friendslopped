import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreFor, TunedInGame, validateConfig } from './engine.ts';

const ctx = { now: 0, isHost: true };
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));

function party(n = 4, psychicTurns = 1) {
  return new TunedInGame({ players: players(n), config: { psychicTurns, targetScore: 10 }, modeId: 'party', now: 0, random: () => 0.5 });
}

test('score bands', () => {
  assert.equal(scoreFor(50, 50), 4);
  assert.equal(scoreFor(52.5, 50), 4);
  assert.equal(scoreFor(56, 50), 3);
  assert.equal(scoreFor(39, 50), 2);
  assert.equal(scoreFor(30, 50), 0);
});

test('player minimums depend on mode', () => {
  assert.equal(validateConfig({ psychicTurns: 1, targetScore: 10 }, 3, 'party'), null);
  assert.match(validateConfig({ psychicTurns: 1, targetScore: 10 }, 3, 'teams')!, /at least 4/);
});

test('party round: only psychic sees target, guesses hidden until reveal, scoring', () => {
  const g = party();
  const psychic = g.view('p0').psychicId;
  const others = ['p0', 'p1', 'p2', 'p3'].filter((id) => id !== psychic);
  const target = g.view(psychic).target!;
  assert.equal(g.view(others[0]!).target, null);
  assert.ok(g.handle(others[0]!, { type: 'clue', text: 'nope' }, ctx));
  assert.equal(g.handle(psychic, { type: 'clue', text: 'Lukewarm tea' }, ctx), null);
  assert.equal(g.phase, 'guess');

  g.handle(others[0]!, { type: 'dial', value: target }, ctx);
  g.handle(others[1]!, { type: 'dial', value: target + 6 }, ctx);
  g.handle(others[2]!, { type: 'dial', value: target + 40 > 100 ? target - 40 : target + 40 }, ctx);
  assert.equal(g.view(others[1]!).players.find((p) => p.id === others[0])!.guess, null, 'guesses are secret');
  for (const id of others) g.handle(id, { type: 'lock' }, ctx);
  assert.equal(g.phase, 'reveal');
  const v = g.view(others[0]!);
  const score = (id: string) => v.players.find((p) => p.id === id)!.score;
  assert.equal(score(others[0]!), 4);
  assert.equal(score(others[1]!), 3);
  assert.equal(score(others[2]!), 0);
  assert.equal(score(psychic), 2, 'psychic gets the rounded average (7/3)');
});

test('party game ends after everyone has been psychic', () => {
  const g = party(3);
  for (let r = 0; r < 3; r++) {
    assert.equal(g.phase, 'clue');
    g.handle(g.view('p0').psychicId, { type: 'clue', text: 'x' }, ctx);
    g.tick(g.phaseEndsAt);
    assert.equal(g.phase, 'reveal');
    for (const id of ['p0', 'p1', 'p2']) g.handle(id, { type: 'ready' }, ctx);
  }
  assert.equal(g.phase, 'gameOver');
  assert.equal(g.view('p0').winnerIds.length > 0, true);
});

test('teams: shared dial, counter-guess steal, first to target wins', () => {
  const g = new TunedInGame({ players: players(4), config: { psychicTurns: 1, targetScore: 5 }, modeId: 'teams', now: 0, random: () => 0.3 });
  const v0 = g.view('p0');
  const team = v0.activeTeam!;
  const psychic = v0.psychicId;
  const mate = v0.players.find((p) => p.team === team && p.id !== psychic)!.id;
  const rival = v0.players.find((p) => p.team !== team)!.id;
  const target = g.view(psychic).target!;
  g.handle(psychic, { type: 'clue', text: 'clue' }, ctx);
  assert.ok(g.handle(rival, { type: 'dial', value: 10 }, ctx), 'rivals cannot touch the dial');
  g.handle(mate, { type: 'dial', value: target + 6 }, ctx);
  assert.equal(g.view(rival).teamDial, target + 6, 'everyone watches the shared dial');
  g.handle(mate, { type: 'lock' }, ctx);
  assert.equal(g.phase, 'counter');
  assert.ok(g.handle(mate, { type: 'counter', side: 'left' }, ctx));
  g.handle(rival, { type: 'counter', side: 'left' }, ctx);
  assert.equal(g.phase, 'reveal');
  const teams = g.view(rival).teams;
  assert.equal(teams[team]!.score, 3);
  assert.equal(teams[1 - team]!.score, 1);
  g.tick(g.phaseEndsAt);
  assert.equal(g.view('p0').activeTeam, 1 - team, 'turn passes to the other team');
});

test('psychic leaving skips the round', () => {
  const g = party(4);
  g.playerLeft(g.view('p0').psychicId, 0);
  assert.equal(g.phase, 'reveal');
});
