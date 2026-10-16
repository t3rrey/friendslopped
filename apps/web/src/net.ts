import { useSyncExternalStore } from 'react';
import type { ClientMessage, GameInfo, LobbyState, LobbySummary, ServerMessage } from '@friendslopped/shared';
import { sfx } from './sfx.ts';

export interface NetState {
  status: 'idle' | 'connecting' | 'open' | 'reconnecting';
  me: { id: string; name: string } | null;
  games: GameInfo[];
  lobbies: LobbySummary[];
  lobby: LobbyState | null;
  /** Game whose lobby browser is open (before joining a lobby). */
  browsing: string | null;
  /** serverTime ≈ Date.now() + clockOffset */
  clockOffset: number;
  toast: { id: number; text: string; tone: 'error' | 'info' } | null;
}

const TOKEN_KEY = 'fs.session';
const NAME_KEY = 'fs.name';

let state: NetState = {
  status: 'idle',
  me: null,
  games: [],
  lobbies: [],
  lobby: null,
  browsing: null,
  clockOffset: 0,
  toast: null,
};
const listeners = new Set<() => void>();
let ws: WebSocket | null = null;
let retry = 0;
let toastSeq = 0;
/** Invite links look like /?join=ABCD; join as soon as we're connected. */
let pendingJoin = new URLSearchParams(location.search).get('join');

function set(patch: Partial<NetState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getState = () => state;

export function useNet<T>(select: (s: NetState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

export const browse = (gameId: string | null) => set({ browsing: gameId });

export const savedName = () => localStorage.getItem(NAME_KEY) ?? '';

export function toast(text: string, tone: 'error' | 'info' = 'info') {
  const id = ++toastSeq;
  set({ toast: { id, text, tone } });
  setTimeout(() => state.toast?.id === id && set({ toast: null }), 3500);
}

/** Connects (or reconnects) as `name`. Session token is per-tab so you can test with several tabs. */
export function connect(name: string) {
  localStorage.setItem(NAME_KEY, name);
  if (ws && ws.readyState <= WebSocket.OPEN) {
    send({ type: 'setName', name });
    return;
  }
  set({ status: retry ? 'reconnecting' : 'connecting' });
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${proto}://${location.host}/ws`);
  ws = socket;
  socket.onopen = () => {
    retry = 0;
    socket.send(JSON.stringify({ type: 'hello', name, sessionToken: sessionStorage.getItem(TOKEN_KEY) ?? undefined }));
  };
  socket.onmessage = (e) => receive(JSON.parse(e.data) as ServerMessage);
  socket.onclose = () => {
    if (ws !== socket) return;
    ws = null;
    retry++;
    set({ status: 'reconnecting' });
    setTimeout(() => connect(savedName() || name), Math.min(5000, 400 * retry));
  };
}

export function send(msg: ClientMessage) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

export const inviteLink = (code: string) => `${location.origin}/?join=${code}`;

export const gameAction = (action: unknown) => send({ type: 'gameAction', action });

function receive(msg: ServerMessage) {
  switch (msg.type) {
    case 'welcome':
      sessionStorage.setItem(TOKEN_KEY, msg.sessionToken);
      set({ status: 'open', me: { id: msg.playerId, name: msg.name }, games: msg.games });
      if (pendingJoin) {
        send({ type: 'joinLobby', code: pendingJoin });
        pendingJoin = null;
        history.replaceState(null, '', location.pathname);
      }
      return;
    case 'lobbies':
      set({ lobbies: msg.lobbies });
      return;
    case 'lobby':
      playCues(state.lobby, msg.lobby);
      set({ lobby: msg.lobby, clockOffset: msg.serverNow - Date.now() });
      return;
    case 'error':
      sfx.buzz();
      toast(msg.message, 'error');
      return;
    case 'kicked':
      sfx.buzz();
      toast('The host removed you from the lobby.', 'error');
      return;
  }
}

/** Sound cues for things that happened between two lobby snapshots. Works for any game view with a `phase`. */
interface CueView {
  phase?: string;
  announcement?: { kind: string }[];
}

function playCues(prev: LobbyState | null, next: LobbyState | null) {
  const a = prev?.game as CueView | null | undefined;
  const b = next?.game as CueView | null | undefined;
  if (prev && next && next.players.length > prev.players.length) sfx.join();
  if (!b?.phase || a?.phase === b.phase) return;
  if (b.phase === 'night') sfx.night();
  else if (b.phase === 'gameOver') sfx.fanfare();
  else if (b.announcement?.some((e) => e.kind === 'death')) sfx.death();
  else if (b.phase === 'reveal') sfx.join();
  else sfx.phase();
}

// Resume an existing session after a refresh.
if (sessionStorage.getItem(TOKEN_KEY) && savedName()) connect(savedName());

// ---- server clock -----------------------------------------------------------

const tickers = new Set<() => void>();
let clock: ReturnType<typeof setInterval> | null = null;

function subscribeClock(cb: () => void) {
  tickers.add(cb);
  clock ??= setInterval(() => tickers.forEach((t) => t()), 250);
  return () => {
    tickers.delete(cb);
    if (!tickers.size && clock) {
      clearInterval(clock);
      clock = null;
    }
  };
}

/** Seconds left until a server timestamp, re-rendering 4x a second. */
export function useSecondsUntil(serverTime: number) {
  return useSyncExternalStore(subscribeClock, () =>
    Math.max(0, Math.ceil((serverTime - (Date.now() + state.clockOffset)) / 1000)),
  );
}
