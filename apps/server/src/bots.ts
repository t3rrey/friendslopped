// Fills a lobby with bots that play Mafia randomly. Handy for solo testing.
//   pnpm bots ABCD 5     → 5 bots join lobby ABCD
//   pnpm bots            → bots host their own lobby, start it and play to the end
import { WebSocket } from 'ws';
import type { LobbyState, ServerMessage } from '@friendslopped/shared';
import type { MafiaView } from '@friendslopped/mafia';

const [codeArg, countArg] = process.argv.slice(2);
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
      if (onLobby) send({ type: 'createLobby', gameId: 'mafia', modeId: 'speed', name: 'Bot Party', isPrivate: false });
      else if (codeArg || joinCode) send({ type: 'joinLobby', code: codeArg ?? joinCode });
    }
    if (msg.type === 'error') console.log(`[bot${i}] error: ${msg.message}`);
    if (msg.type !== 'lobby' || !msg.lobby) return;
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
