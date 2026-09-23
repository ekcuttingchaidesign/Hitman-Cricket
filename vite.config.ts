import { defineConfig, type Plugin } from 'vite';
import { memoryRooms, memoryStore } from './src/server/memory-store';
import type { SurviveInnings } from './src/game/survive-board';
import { CLASSIC_LADDER, SURVIVE_LADDER, readBoard, refused, submitScore } from './src/server/board-store';
import {
  createRoom, joinRoom, pushInnings, readRoom, roomRefused, startRoom,
  type RoomCaller, type RoomStore,
} from './src/server/room-store';

/**
 * The board's and the rooms' endpoints, served by the dev server.
 *
 * `npm run dev` gives you the whole game — the board, claiming a place, a name
 * being refused because somebody already has it, a room made in one tab and
 * joined in another — with no Vercel CLI, no credentials and no database. That
 * matters because the alternative is that the only way to see the feature
 * working is to deploy it.
 *
 * The rules are the real ones: this mounts the same `readBoard` and
 * `submitScore` that `api/` does, so the only thing standing in is where the
 * rows are kept. The board starts empty and is forgotten when the server stops,
 * which is what you want while working on it.
 */
function boardEndpoints(): Plugin {
  // One store per board, the same way the deployed keys are scoped. Sharing one
  // here would let a dev session rank a chase against a five-over slog and look
  // fine, which is exactly the bug the scoping exists to stop.
  //
  // The names are the exception, and shared for the same reason they are shared
  // in Redis: a name belongs to a person rather than to an innings, so a player
  // carries theirs from one board to the other and nobody else can bat under it.
  const names = new Map<string, string>();
  const boards = { '': memoryStore(names), 'survive:': memoryStore<SurviveInnings>(names) };
  // Rooms are forgotten with the server too, and they expire on their own while
  // it runs, so a code left over from an hour of poking about stops working the
  // same way it would in production.
  const rooms = memoryRooms();
  const ENDPOINTS = ['/api/board', '/api/score', '/api/room'];
  return {
    name: 'hitman-board-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (!ENDPOINTS.includes(path)) return next();
        const send = (status: number, body: unknown, cache = 'no-store') => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', cache);
          res.end(JSON.stringify(body));
        };
        try {
          if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
          const query = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
          if (path === '/api/room') {
            const outcome = await roomCall(rooms, req, query);
            if (roomRefused(outcome)) return send(outcome.status, { error: outcome.reason });
            // The same header the deployed endpoint sends on a read, so a poll
            // behaves here the way it will behind the edge cache.
            return send(200, outcome, req.method === 'GET' ? 'public, s-maxage=2, stale-while-revalidate=4' : 'no-store');
          }
          const survive = query.get('mode') === 'survive';
          if (path === '/api/board') {
            if (req.method !== 'GET') return send(405, { error: 'Use GET.' });
            if (survive) {
              return send(200, await readBoard(boards['survive:'], SURVIVE_LADDER),
                'public, s-maxage=10, stale-while-revalidate=59');
            }
            // The same header the deployed endpoint sends. There is no edge
            // cache in front of a dev server, so it costs nothing here — and it
            // means `npm run check:board` asks the same question of both.
            return send(200, await readBoard(boards[''], CLASSIC_LADDER), 'public, s-maxage=10, stale-while-revalidate=59');
          }
          if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
          const body = JSON.parse(await read(req)) as Record<string, unknown>;
          const who = {
            playerId: String(body.playerId ?? ''),
            name: String(body.name ?? ''),
            avatar: Number(body.avatar),
            // One address in development: whatever the dev server sees.
            address: 'dev',
          };
          const asked = String(body.mode ?? '').toLowerCase() === 'survive';
          const outcome = asked
            ? await submitScore(boards['survive:'], SURVIVE_LADDER, { ...who, innings: surviveFigures(body.innings) })
            : await submitScore(boards[''], CLASSIC_LADDER, { ...who, innings: figures(body.innings) });
          return refused(outcome) ? send(outcome.status, { error: outcome.reason }) : send(200, outcome);
        } catch (error) {
          send(400, { error: error instanceof Error ? error.message : 'Bad request.' });
        }
      });
    },
  };
}

/**
 * One of the room calls, picked apart from the request the same way `api/room.ts`
 * picks it apart — the rules underneath are the identical import, so only where
 * the rooms are kept stands in.
 */
async function roomCall(
  rooms: RoomStore,
  req: { method?: string; on(event: string, fn: (chunk?: unknown) => void): void },
  query: URLSearchParams,
) {
  if (req.method === 'GET') return readRoom(rooms, query.get('code') ?? '');
  if (req.method !== 'POST') return { ok: false as const, status: 405, reason: 'Use GET or POST.' };
  const body = JSON.parse(await read(req)) as Record<string, unknown>;
  const code = String(body.code ?? '');
  const who: RoomCaller = {
    playerId: String(body.playerId ?? ''),
    name: String(body.name ?? ''),
    avatar: Number(body.avatar),
    // One address in development: whatever the dev server sees.
    address: 'dev',
  };
  switch (String(body.action ?? '')) {
    case 'create': return createRoom(rooms, who);
    case 'join': return joinRoom(rooms, code, who);
    case 'start': return startRoom(rooms, code, who.playerId, who.address);
    case 'score': return pushInnings(rooms, code, { ...who, innings: figures(body.innings), done: body.done === true });
    default: return { ok: false as const, status: 400, reason: 'Say what to do with the room.' };
  }
}

function read(req: { on(event: string, fn: (chunk?: unknown) => void): void }): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body || '{}'));
    req.on('error', reject);
  });
}

function figures(raw: unknown) {
  const from = (raw ?? {}) as Record<string, unknown>;
  const read = (key: string) => Number(from[key]);
  return {
    runs: read('runs'), sixes: read('sixes'), fours: read('fours'),
    wickets: read('wickets'), dots: read('dots'), balls: read('balls'),
  };
}

/** The Test match's five, the same way. */
function surviveFigures(raw: unknown): SurviveInnings {
  const from = (raw ?? {}) as Record<string, unknown>;
  const read = (key: string) => Number(from[key]);
  return {
    runs: read('runs'), balls: read('balls'), wickets: read('wickets'),
    blows: read('blows'), health: read('health'),
  };
}

export default defineConfig({
  base: './',
  plugins: [boardEndpoints()],
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
