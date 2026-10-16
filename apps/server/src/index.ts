import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import type { ClientMessage, ServerMessage } from '@friendslopped/shared';
import { Hub, type Connection } from './hub.ts';

const PORT = Number(process.env.PORT ?? 3001);
const WEB_DIST = fileURLToPath(new URL('../../web/dist/', import.meta.url));
const MAX_MESSAGE_BYTES = 4096;
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
};

const hub = new Hub();
setInterval(() => hub.tick(), 250);

// Serves the built web client in production; in dev, Vite serves it and proxies /ws here.
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!)).replace(/^(\.\.[/\\])+/, '');
  if (path === '/health') return res.end('ok');
  for (const candidate of [join(WEB_DIST, path), join(WEB_DIST, 'index.html')]) {
    if (!candidate.startsWith(WEB_DIST)) continue;
    try {
      if (!(await stat(candidate)).isFile()) continue;
      res.writeHead(200, { 'content-type': MIME[extname(candidate)] ?? 'application/octet-stream' });
      return res.end(await readFile(candidate));
    } catch {}
  }
  res.writeHead(404).end('Not found — run `pnpm build` or use `pnpm dev`.');
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });

wss.on('connection', (ws) => {
  const conn: Connection = {
    send: (msg: ServerMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg)),
  };
  let session: ReturnType<Hub['hello']> | null = null;

  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;
    if (!session) {
      if (msg.type === 'hello') session = hub.hello(conn, msg);
      return;
    }
    hub.handle(session, msg, conn);
  });

  ws.on('close', () => session && hub.disconnect(session, conn));
});

server.listen(PORT, () => console.log(`friendslopped server on http://localhost:${PORT}`));
