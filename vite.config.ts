import { defineConfig, type Plugin } from 'vite';
import { memoryStore } from './src/server/memory-store';
import type { SurviveInnings } from './src/game/survive-board';
import { CLASSIC_LADDER, SURVIVE_LADDER, readBoard, refused, submitScore } from './src/server/board-store';
import { FEEDBACK_KEPT, feedbackCsv, refusedFeedback, takeFeedback } from './src/server/feedback-store';
import { memoryFeedback } from './src/server/memory-feedback';

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
  // One store per board, the same way the deployed keys are scoped. Sharing one
  // here would let a dev session rank a chase against a five-over slog and look
  // fine, which is exactly the bug the scoping exists to stop.
  //
  // The names are the exception, and shared for the same reason they are shared
  // in Redis: a name belongs to a person rather than to an innings, so a player
  // carries theirs from one board to the other and nobody else can bat under it.
  const names = new Map<string, string>();
  const boards = { '': memoryStore(names), 'survive:': memoryStore<SurviveInnings>(names) };
  // The questionnaire, backed the same way and for the same reason: the form can
  // be opened, filled in, sent and read back as a spreadsheet with no
  // credentials and no database. It is forgotten when the server stops, which is
  // what you want while working on the questions.
  const feedback = memoryFeedback();
  return {
    name: 'hitman-board-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (path !== '/api/board' && path !== '/api/score' && path !== '/api/feedback') return next();
        const send = (status: number, body: unknown, cache = 'no-store') => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', cache);
          res.end(JSON.stringify(body));
        };
        try {
          if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
          if (path === '/api/feedback') {
            // No key on the read here. The deployed endpoint holds one because
            // it is answering the internet; this one is answering whoever is
            // running the dev server, and they wrote the answers.
            if (req.method === 'GET') {
              const entries = await feedback.read(FEEDBACK_KEPT);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'text/csv; charset=utf-8');
              res.setHeader('Cache-Control', 'no-store');
              return res.end(feedbackCsv(entries));
            }
            if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
            const form = JSON.parse(await read(req)) as Record<string, unknown>;
            const outcome = await takeFeedback(feedback, {
              playerId: form.playerId, answers: form.answers,
              suggestion: form.suggestion, context: form.context, address: 'dev',
            });
            return refusedFeedback(outcome)
              ? send(outcome.status, { error: outcome.reason })
              : send(200, { ok: true });
          }
          const survive = new URLSearchParams((req.url ?? '').split('?')[1] ?? '').get('mode') === 'survive';
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
