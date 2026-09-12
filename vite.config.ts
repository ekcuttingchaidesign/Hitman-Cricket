import { defineConfig, type Plugin } from 'vite';
import { memoryStore } from './src/server/memory-store';
import { readBoard, submitScore } from './src/server/board-store';

/**
 * The board's endpoints, served by the dev server.
 *
 * `npm run dev` gives you the whole game — the board, claiming a place, a name
 * being refused because somebody already has it — with no Vercel CLI, no
 * credentials and no database. That matters because the alternative is that the
 * only way to see the feature working is to deploy it.
 *
 * The rules are the real ones: this mounts the same `readBoard` and
 * `submitScore` that `api/` does, so the only thing standing in is where the
 * rows are kept. The board starts empty and is forgotten when the server stops,
 * which is what you want while working on it.
 */
function boardEndpoints(): Plugin {
  const store = memoryStore();
  return {
    name: 'hitman-board-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (path !== '/api/board' && path !== '/api/score') return next();
        const send = (status: number, body: unknown, cache = 'no-store') => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', cache);
          res.end(JSON.stringify(body));
        };
        try {
          if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
          if (path === '/api/board') {
            if (req.method !== 'GET') return send(405, { error: 'Use GET.' });
            // The same header the deployed endpoint sends. There is no edge
            // cache in front of a dev server, so it costs nothing here — and it
            // means `npm run check:board` asks the same question of both.
            return send(200, await readBoard(store), 'public, s-maxage=10, stale-while-revalidate=59');
          }
          if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
          const body = JSON.parse(await read(req)) as Record<string, unknown>;
          const outcome = await submitScore(store, {
            playerId: String(body.playerId ?? ''),
            name: String(body.name ?? ''),
            avatar: Number(body.avatar),
            innings: figures(body.innings),
            // One address in development: whatever the dev server sees.
            address: 'dev',
          });
          return outcome.ok ? send(200, outcome) : send(outcome.status, { error: outcome.reason });
        } catch (error) {
          send(400, { error: error instanceof Error ? error.message : 'Bad request.' });
        }
      });
    },
  };
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

export default defineConfig({
  base: './',
  plugins: [boardEndpoints()],
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
