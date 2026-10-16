// Fills a lobby with bots that play randomly. Handy for solo testing.
//   pnpm bots ABCD 5                      → 5 bots join lobby ABCD (any game)
//   pnpm bots                             → bots host a Mafia lobby and play to the end
//   GAME=tunedin MODE=teams pnpm bots     → same, for another game/mode
import { WebSocket } from 'ws';
import type { LobbyState, ServerMessage } from '@friendslopped/shared';
import type { MafiaView } from '@friendslopped/mafia';
import type { DialView } from '@friendslopped/tunedin';

const [codeArg, countArg] = process.argv.slice(2);
const GAME = process.env.GAME ?? 'mafia';
const MODE = process.env.MODE ?? (GAME === 'mafia' ? 'speed' : 'party');
const URL = process.env.SERVER_URL ?? 'ws://localhost:3001/ws';
const count = Number(countArg ?? (codeArg ? 4 : 6));
const NAMES = ['Bowser', 'Yoshi', 'Wario', 'Toad', 'Peach', 'Kirby', 'Fox', 'Falco', 'Ness', 'Samus', 'Link', 'Zelda'];
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

let finished = 0;

function bot(i: number, onLobby?: (code: string) => void) {
  const ws = new WebSocket(URL);
  const send = (msg: object) => ws.send(JSON.stringify(msg));
  let acted = '';
  let lastPhase = '';
  ws.on('open', () => send({ type: 'hello', name: `${NAMES[i % NAMES.length]}Bot` }));
  ws.on('message', (data) => {
    const msg = JSON.parse(String(data)) as ServerMessage;
    if (msg.type === 'welcome') {
      if (onLobby) send({ type: 'createLobby', gameId: GAME, modeId: MODE, name: 'Bot Party', isPrivate: false });
      else if (codeArg || joinCode) send({ type: 'joinLobby', code: codeArg || joinCode });
    }
    if (msg.type === 'error') console.log(`[bot${i}] error: ${msg.message}`);
    if (msg.type !== 'lobby' || !msg.lobby) return;
    if (msg.lobby.gameId === 'tunedin') {
      const done = playTunedIn(i, msg.lobby as LobbyState<unknown, DialView>, send, onLobby, count);
      if (done && i === 0 && onLobby) setTimeout(() => process.exit(0), 300);
      return;
    }
    const lobby = msg.lobby as LobbyState<unknown, MafiaView>;
    if (onLobby && lobby.status === 'waiting') {
      onLobby(lobby.code);
      if (lobby.players.length >= count && !lobby.startError) send({ type: 'startGame' });
    }
    const g = lobby.game;
    if (!g) return;
    if (g.phase !== lastPhase && i === 0) {
      console.log(`--- ${g.phase} ${g.round}`);
      for (const e of g.announcement) console.log(`    ${e.text}`);
    }
    lastPhase = g.phase;
    const key = `${g.phase}${g.round}`;
    if (acted === key || !g.myAlive) return;
    const me = g.players.find((p) => p.id === g.meId)!;
    if ((g.phase === 'reveal' || g.phase === 'day') && !me.ready) {
      acted = key;
      setTimeout(() => send({ type: 'gameAction', action: { type: 'ready' } }), 200 + Math.random() * 600);
    }
    if (g.phase === 'night' && g.night) {
      acted = key;
      const target = pick(g.night.validTargetIds);
      setTimeout(() => send({ type: 'gameAction', action: { type: 'nightTarget', targetId: target } }), 300 + Math.random() * 800);
    }
    if (g.phase === 'vote') {
      acted = key;
      const options = [...g.players.filter((p) => p.alive && p.id !== g.meId).map((p) => p.id), 'skip'];
      setTimeout(() => send({ type: 'gameAction', action: { type: 'vote', targetId: pick(options) } }), 300 + Math.random() * 800);
    }
    if (g.phase === 'gameOver' && i === 0 && onLobby) {
      acted = key;
      console.log(`=== ${g.winner} win. Roles: ${g.players.map((p) => `${p.name}=${p.role}`).join(', ')}`);
      if (++finished) setTimeout(() => process.exit(0), 300);
    }
  });
}

let joinCode: string | undefined;
if (codeArg) {
  for (let i = 0; i < count; i++) bot(i);
} else {
  bot(0, (code) => {
    if (joinCode) return;
    joinCode = code;
    console.log(`Lobby ${code}`);
    for (let i = 1; i < count; i++) bot(i);
  });
}

const dialActed = new Map<number, string>();
const dialPhase = new Map<number, string>();

/** Returns true once the game is over. */
function playTunedIn(
  i: number,
  lobby: LobbyState<unknown, DialView>,
  send: (msg: object) => void,
  host: ((code: string) => void) | undefined,
  count: number,
): boolean {
  if (host && lobby.status === 'waiting') {
    host(lobby.code);
    if (lobby.players.length >= count && !lobby.startError) send({ type: 'startGame' });
  }
  const g = lobby.game;
  if (!g) return false;
  const act = (action: object, delay = 300 + Math.random() * 900) =>
    setTimeout(() => send({ type: 'gameAction', action }), delay);
  const key = `${g.phase}${g.round}`;
  if (i === 0 && dialPhase.get(i) !== key) {
    dialPhase.set(i, key);
    const scores = g.mode.id === 'teams' ? g.teams.map((t) => `${t.name} ${t.score}`).join(' · ') : g.players.map((p) => `${p.name} ${p.score}`).join(' · ');
    console.log(`--- ${g.phase} r${g.round} ${g.spectrum.left}↔${g.spectrum.right} ${g.clue ? `"${g.clue}"` : ''} | ${scores}`);
    for (const line of g.result?.lines ?? []) console.log(`    ${line}`);
  }
  if (dialActed.get(i) === key) return g.phase === 'gameOver';
  const me = g.players.find((p) => p.id === g.meId)!;
  const psychic = g.psychicId === g.meId;
  const activeTeam = g.mode.id === 'party' || me.team === g.activeTeam;
  if (g.phase === 'clue' && psychic && g.target !== null) {
    dialActed.set(i, key);
    act({ type: 'clue', text: `About ${g.target}% ${g.spectrum.right.toLowerCase()}` });
  } else if (g.phase === 'guess' && !psychic && activeTeam) {
    dialActed.set(i, key);
    act({ type: 'dial', value: Math.random() * 100 });
    act({ type: 'lock' }, 1500 + Math.random() * 1500);
  } else if (g.phase === 'counter' && !activeTeam) {
    dialActed.set(i, key);
    act({ type: 'counter', side: Math.random() < 0.5 ? 'left' : 'right' });
  } else if (g.phase === 'reveal') {
    dialActed.set(i, key);
    act({ type: 'ready' }, 800);
  } else if (g.phase === 'gameOver') {
    dialActed.set(i, key);
    if (i === 0) console.log(`=== winners: ${g.winnerTeam !== null ? g.teams[g.winnerTeam]!.name : g.winnerIds.map((id) => g.players.find((p) => p.id === id)?.name).join(', ')}`);
    return true;
  }
  return false;
}
