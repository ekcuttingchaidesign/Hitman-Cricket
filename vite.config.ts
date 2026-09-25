import { defineConfig, type Plugin } from 'vite';
import { memoryChallenges, memoryStore } from './src/server/memory-store';
import type { SurviveInnings } from './src/game/survive-board';
import { CLASSIC_LADDER, SURVIVE_LADDER, cleanName, readBoard, refused, submitScore } from './src/server/board-store';
import { FEEDBACK_KEPT, feedbackCsv, refusedFeedback, takeFeedback } from './src/server/feedback-store';
import { memoryFeedback } from './src/server/memory-feedback';
import {
  answerChallenge, challengeRefused, createChallenge, readChallenge,
  type Batter, type ChallengeStore,
} from './src/server/challenge-store';
import {
  CAREER_BOARD_SIZE, countInnings, nameCareer, readCareer, readCareerBoards, refusedCareer,
} from './src/server/career-store';
import { memoryCareer } from './src/server/memory-career';
import { memoryRecovery } from './src/server/memory-recovery';
import { foldName } from './src/server/board-store';
import { firstKey, keyOnClaim, newKey, refusedRecovery, restore } from './src/server/recovery-store';
import {
  BLAST_CAREER, SURVIVE_CAREER, readBlastTally, readSurviveTally,
  type BlastCareer, type SurviveCareer,
} from './src/game/career';

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
  // The careers, backed the same way, sharing the same name registry — so a
  // name claimed on an innings board is the name a career is ranked under, the
  // way the deployed keys arrange it.
  const careers = {
    classic: memoryCareer<BlastCareer>(names),
    survive: memoryCareer<SurviveCareer>(names),
  };
  // The career keys, sharing that same registry for the same reason: restoring
  // asks who holds a name, and claiming is what wrote it. Two maps here would
  // pass a test the deployed store fails, which is worse than no fake at all.
  const recovery = memoryRecovery(names);
  // Challenges are forgotten with the server too, and they expire on their own
  // while it runs, so a code left over from an hour of poking about stops
  // working the same way it would in production.
  const challenges = memoryChallenges();
  return {
    name: 'hitman-board-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        const known = ['/api/board', '/api/score', '/api/feedback', '/api/career', '/api/innings',
          '/api/restore', '/api/challenge'];
        if (!known.includes(path)) return next();
        const send = (status: number, body: unknown, cache = 'no-store') => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', cache);
          res.end(JSON.stringify(body));
        };
        try {
          if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
          const challengeQuery = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
          if (path === '/api/challenge') {
            const outcome = await challengeCall(challenges, req, challengeQuery);
            if (challengeRefused(outcome)) return send(outcome.status, { error: outcome.reason });
            // The same header the deployed endpoint sends on a read, so a check
            // behaves here the way it will behind the edge cache.
            return send(200, outcome, req.method === 'GET' ? 'public, s-maxage=2, stale-while-revalidate=4' : 'no-store');
          }
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
          const query = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
          const survive = query.get('mode') === 'survive';
          if (path === '/api/career') {
            if (req.method !== 'GET') return send(405, { error: 'Use GET.' });
            const player = query.get('player') ?? '';
            if (player) {
              return send(200, survive
                ? await readCareer(careers.survive, SURVIVE_CAREER, player)
                : await readCareer(careers.classic, BLAST_CAREER, player));
            }
            const boards = survive
              ? await readCareerBoards(careers.survive, SURVIVE_CAREER)
              : await readCareerBoards(careers.classic, BLAST_CAREER);
            // The same header the deployed endpoint sends. There is no edge
            // cache in front of a dev server, so it costs nothing here.
            return send(200, { ...boards, size: CAREER_BOARD_SIZE },
              'public, s-maxage=300, stale-while-revalidate=3600');
          }
          if (path === '/api/innings') {
            if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
            const sent = JSON.parse(await read(req)) as Record<string, unknown>;
            const counting = {
              playerId: String(sent.playerId ?? ''),
              name: String(sent.name ?? ''),
              avatar: Number(sent.avatar),
              nonce: String(sent.nonce ?? ''),
              address: 'dev',
            };
            const asked = String(sent.mode ?? '').toLowerCase() === 'survive';
            const counted = asked
              ? await countInnings(careers.survive, SURVIVE_CAREER, { ...counting, tally: readSurviveTally(sent.innings) })
              : await countInnings(careers.classic, BLAST_CAREER, { ...counting, tally: readBlastTally(sent.innings) });
            return refusedCareer(counted) ? send(counted.status, { error: counted.reason }) : send(200, counted);
          }
          if (path === '/api/restore') {
            if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
            const asked = JSON.parse(await read(req)) as Record<string, unknown>;
            // Every branch `api/restore.ts` has, because this file is a second
            // implementation of the same routing and a branch missing here does
            // not fail — it falls through to the next one and answers something
            // plausible. `?first=1` arrived in production and silently became a
            // malformed-key complaint in development, which is a difference
            // between the two that nothing was watching for.
            if ((req.url ?? '').includes('first=')) {
              const made = await firstKey(recovery, { name: asked.name, playerId: asked.playerId });
              return refusedRecovery(made)
                ? send(made.status, { error: made.reason })
                : send(200, { key: made.key });
            }
            if ((req.url ?? '').includes('new=')) {
              const made = await newKey(recovery, { name: asked.name, playerId: asked.playerId });
              return refusedRecovery(made)
                ? send(made.status, { error: made.reason })
                : send(200, { key: made.key });
            }
            // One address in development, the same way the board's is 'dev' —
            // which means the rate limit is real here and shared by everybody
            // testing. That is the honest version: a limit nobody can reach in
            // development is a limit nobody has tried.
            const brought = await restore(recovery, { name: asked.name, key: asked.key, address: 'dev' });
            return refusedRecovery(brought)
              ? send(brought.status, { error: brought.reason })
              : send(200, { playerId: brought.playerId });
          }
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
          if (refused(outcome)) return send(outcome.status, { error: outcome.reason });
          // The same stamp the deployed endpoint makes: a name just claimed
          // puts the career already counted under it onto the career boards,
          // rather than waiting for an innings the player has not played yet.
          await (asked
            ? nameCareer(careers.survive, SURVIVE_CAREER, who.playerId, cleanName(who.name), who.avatar)
            : nameCareer(careers.classic, BLAST_CAREER, who.playerId, cleanName(who.name), who.avatar));
          // And the key, minted the first time this name is claimed and handed
          // over once, exactly as the deployed endpoint does it.
          const key = await keyOnClaim(recovery, foldName(cleanName(who.name)));
          return send(200, key ? { ...outcome, key } : outcome);
        } catch (error) {
          send(400, { error: error instanceof Error ? error.message : 'Bad request.' });
        }
      });
    },
  };
}

/**
 * One of the challenge calls, picked apart from the request the same way
 * `api/challenge.ts` picks it apart — the rules underneath are the identical
 * import, so only where the challenges are kept stands in.
 */
async function challengeCall(
  challenges: ChallengeStore,
  req: { method?: string; on(event: string, fn: (chunk?: unknown) => void): void },
  query: URLSearchParams,
) {
  if (req.method === 'GET') return readChallenge(challenges, query.get('code') ?? '');
  if (req.method !== 'POST') return { ok: false as const, status: 405, reason: 'Use GET or POST.' };
  const body = JSON.parse(await read(req)) as Record<string, unknown>;
  const who: Batter = {
    playerId: String(body.playerId ?? ''),
    name: String(body.name ?? ''),
    avatar: Number(body.avatar),
    // One address in development: whatever the dev server sees.
    address: 'dev',
    card: body.card,
  };
  switch (String(body.action ?? '')) {
    case 'create': return createChallenge(challenges, who);
    case 'answer': return answerChallenge(challenges, String(body.code ?? ''), who);
    default: return { ok: false as const, status: 400, reason: 'Say what to do with the challenge.' };
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
  // Git worktrees get made inside `.claude/`, and a worktree is a whole second
  // copy of this repository — tests included. Left to its default globs vitest
  // collects those copies too, so one checkout's run reports another checkout's
  // failures and the same test name appears three times with three different
  // sets of numbers. It is a genuinely baffling half hour if you have not seen
  // it before.
  test: { exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'] },
  // The rig preview is a second entry so a branch deployment serves it at
  // /shot-preview.html. It is unlinked from the game and pulls in nothing the
  // game does not already ship; drop this entry before a production release if
  // you would rather it were not reachable.
  build: { rollupOptions: { input: { game: 'index.html', preview: 'shot-preview.html' }, output: { manualChunks: { three: ['three'] } } } },
});
