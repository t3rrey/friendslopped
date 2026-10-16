import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MafiaGame, SKIP, validateConfig } from './engine.ts';
import type { Role } from './types.ts';

const host = { now: 0, isHost: true };
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));

function setup(n = 6, config = { killers: 1, detectives: 1, healers: 1 }) {
  // Identity "shuffle": random() = 0.999 keeps every element in place.
  const game = new MafiaGame({ players: players(n), config, modeId: 'classic', now: 0, random: () => 0.999 });
  const byRole = (role: Role) => game.view('p0').players.filter((_, i) => roleOf(game, `p${i}`) === role).map((p) => p.id);
  return { game, byRole };
}

function roleOf(game: MafiaGame, id: string) {
  return game.view(id).myRole;
}

function everyoneReady(game: MafiaGame) {
  for (const p of game.view('p0').players) game.handle(p.id, { type: 'ready' }, host);
}

test('validates role counts', () => {
  assert.match(validateConfig({ killers: 1, detectives: 1, healers: 1 }, 3)!, /at least 4/);
  assert.match(validateConfig({ killers: 2, detectives: 0, healers: 0 }, 4)!, /outnumbered/);
  assert.match(validateConfig({ killers: 1, detectives: 3, healers: 1 }, 4)!, /More roles/);
  assert.equal(validateConfig({ killers: 2, detectives: 1, healers: 1 }, 7), null);
});

test('assigns exactly the configured roles', () => {
  const game = new MafiaGame({
    players: players(10),
    config: { killers: 3, detectives: 2, healers: 1 },
    modeId: 'classic',
    now: 0,
  });
  const roles = players(10).map((p) => roleOf(game, p.id));
  assert.equal(roles.filter((r) => r === 'killer').length, 3);
  assert.equal(roles.filter((r) => r === 'detective').length, 2);
  assert.equal(roles.filter((r) => r === 'healer').length, 1);
  assert.equal(roles.filter((r) => r === 'villager').length, 4);
});

test('hides roles from town but shows fellow killers', () => {
  const { game } = setup(8, { killers: 2, detectives: 1, healers: 1 });
  const killerView = game.view('p0');
  assert.equal(killerView.players[1]!.role, 'killer');
  assert.equal(killerView.players[2]!.role, null);
  const townView = game.view('p5');
  assert.equal(townView.players[0]!.role, null);
});

test('full loop: kill at night, vote out killer by day, town wins', () => {
  const { game, byRole } = setup();
  const [killer] = byRole('killer');
  const [detective] = byRole('detective');
  const [healer] = byRole('healer');
  assert.deepEqual([killer, detective, healer], ['p0', 'p1', 'p2']);

  everyoneReady(game);
  assert.equal(game.phase, 'night');
  game.handle('p0', { type: 'nightTarget', targetId: 'p5' }, host);
  game.handle('p1', { type: 'nightTarget', targetId: 'p0' }, host);
  game.handle('p2', { type: 'nightTarget', targetId: 'p2' }, host);
  assert.equal(game.phase, 'dawn', 'night ends once every role has acted');
  assert.equal(game.view('p5').myAlive, false);
  assert.match(game.view('p1').announcement.map((e) => e.text).join(), /found dead/);
  assert.ok(game.view('p1').log.some((e) => /P0 is a KILLER/.test(e.text)));
  assert.ok(!game.view('p3').log.some((e) => /KILLER/.test(e.text)), 'findings are private');
  assert.equal(game.view('p1').players[0]!.investigated, 'killers');

  game.tick(game.phaseEndsAt);
  assert.equal(game.phase, 'day');
  game.handle('p0', { type: 'advance' }, host);
  assert.equal(game.phase, 'vote');
  assert.ok(game.handle('p5', { type: 'vote', targetId: 'p0' }, host), 'dead cannot vote');
  for (const id of ['p1', 'p2', 'p3']) game.handle(id, { type: 'vote', targetId: 'p0' }, host);
  game.handle('p0', { type: 'vote', targetId: 'p1' }, host);
  game.handle('p4', { type: 'vote', targetId: SKIP }, host);
  assert.equal(game.phase, 'verdict');
  game.tick(game.phaseEndsAt);
  assert.equal(game.phase, 'gameOver');
  assert.equal(game.view('p3').winner, 'town');
});

test('healer save prevents the kill and cannot repeat a target', () => {
  const { game } = setup();
  everyoneReady(game);
  game.handle('p0', { type: 'nightTarget', targetId: 'p4' }, host);
  game.handle('p1', { type: 'nightTarget', targetId: 'p3' }, host);
  game.handle('p2', { type: 'nightTarget', targetId: 'p4' }, host);
  assert.equal(game.view('p4').myAlive, true);
  assert.ok(game.view('p2').log.some((e) => /You saved P4/.test(e.text)));
  game.tick(game.phaseEndsAt); // day
  game.tick(game.phaseEndsAt); // vote
  game.tick(game.phaseEndsAt); // verdict (nobody voted)
  game.tick(game.phaseEndsAt); // night 2
  assert.equal(game.phase, 'night');
  assert.ok(!game.view('p2').night!.validTargetIds.includes('p4'));
  assert.ok(game.handle('p2', { type: 'nightTarget', targetId: 'p4' }, host));
});

test('vote ties and skip majorities eliminate nobody', () => {
  const { game } = setup();
  everyoneReady(game);
  game.tick(game.phaseEndsAt); // dawn, nobody acted
  game.tick(game.phaseEndsAt); // day
  game.tick(game.phaseEndsAt); // vote
  game.handle('p0', { type: 'vote', targetId: 'p1' }, host);
  game.handle('p1', { type: 'vote', targetId: 'p0' }, host);
  game.handle('p2', { type: 'vote', targetId: SKIP }, host);
  game.tick(game.phaseEndsAt);
  assert.equal(game.phase, 'verdict');
  assert.ok(game.view('p0').players.every((p) => p.alive));
});

test('killers win at parity', () => {
  const { game } = setup(4, { killers: 1, detectives: 0, healers: 0 });
  everyoneReady(game);
  game.handle('p0', { type: 'nightTarget', targetId: 'p1' }, host);
  game.tick(game.phaseEndsAt); // day
  game.tick(game.phaseEndsAt); // vote
  for (const id of ['p0', 'p2']) game.handle(id, { type: 'vote', targetId: 'p3' }, host);
  game.handle('p3', { type: 'vote', targetId: 'p0' }, host);
  assert.equal(game.phase, 'verdict');
  game.tick(game.phaseEndsAt);
  assert.equal(game.view('p2').winner, 'killers');
});

test('split killers follow the earliest-seated pick', () => {
  const { game } = setup(8, { killers: 2, detectives: 0, healers: 0 });
  everyoneReady(game);
  game.handle('p1', { type: 'nightTarget', targetId: 'p6' }, host);
  game.handle('p0', { type: 'nightTarget', targetId: 'p5' }, host);
  assert.equal(game.view('p5').myAlive, false);
  assert.equal(game.view('p6').myAlive, true);
});

test('chat channels respect phase and role', () => {
  const { game } = setup();
  everyoneReady(game);
  assert.ok(game.handle('p3', { type: 'chat', channel: 'town', text: 'hi' }, host), 'no town chat at night');
  assert.equal(game.handle('p0', { type: 'chat', channel: 'killers', text: 'psst' }, host), null);
  assert.equal(game.view('p3').chat.length, 0);
  assert.equal(game.view('p0').chat.length, 1);
});

test('leaving mid-game kills the player and can end the game', () => {
  const { game } = setup(4, { killers: 1, detectives: 0, healers: 0 });
  game.playerLeft('p0', 0);
  assert.equal(game.phase, 'gameOver');
  assert.equal(game.view('p1').winner, 'town');
});
