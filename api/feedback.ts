// The `.js` on these is not a mistake and must not be tidied away — see the
// note at the top of `api/board.ts`. `scripts/function-check.mjs` is what keeps
// it honest.
import {
  FEEDBACK_KEPT, feedbackCsv, keyAccepted, refusedFeedback, takeFeedback,
} from '../src/server/feedback-store.js';
import { NoDatabase, redisFromEnv, upstashFeedback } from '../src/server/upstash.js';
import { addressOf, cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';

/**
 * `POST /api/feedback` — a filled-in questionnaire.
 * `GET  /api/feedback?key=…` — every one of them, as a spreadsheet.
 *
 * Everything that decides what is kept lives in `takeFeedback`, which runs the
 * same question list the browser drew the form from. This file only turns a
 * request into that call: the body is read as data and nothing in it is trusted,
 * least of all the clock — the store stamps the form itself.
 *
 * The read is the unusual half. It is the one endpoint in this game that answers
 * with something not meant for everybody, so it is gated on a secret held in the
 * environment and it answers a request without one the way it answers a request
 * for a page that is not there. A 401 would confirm that there is something here
 * worth a key; a 404 says nothing at all, which is what an endpoint nobody but
 * the owner is supposed to know about should say.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (cors(req, res)) return;
  if (req.method === 'GET') return read(req, res);
  if (req.method !== 'POST') return failed(res, 405, 'Use POST.');

  const body = parse(req.body);
  if (!body) return failed(res, 400, 'Send the answers as JSON.');

  try {
    const outcome = await takeFeedback(upstashFeedback(redisFromEnv()), {
      playerId: body.playerId,
      answers: body.answers,
      suggestion: body.suggestion,
      context: body.context,
      address: addressOf(req),
    });
    if (refusedFeedback(outcome)) return failed(res, outcome.status, outcome.reason);
    // An answer is never cached, by anyone, ever.
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof NoDatabase) return failed(res, 503, 'Feedback is not set up yet.', error);
    failed(res, 503, 'That could not be sent. Try again in a minute.', error);
  }
}

/**
 * The answers, for whoever holds the key.
 *
 * CSV by default because of what happens to it next — it is pasted into a
 * spreadsheet and sorted — and JSON on request for anything that wants to read
 * it by machine. Read with the read-only token: an endpoint that cannot write
 * is one fewer thing to get wrong.
 */
async function read(req: ApiRequest, res: ApiResponse) {
  // No key configured is not an open door. Until one is set there is nothing
  // here to read, and saying so as a 404 keeps the two cases indistinguishable
  // from outside.
  const offered = typeof req.query?.key === 'string' ? req.query.key : '';
  if (!keyAccepted(process.env.FEEDBACK_KEY, offered)) return failed(res, 404, 'Not found.');
  try {
    const limit = Math.min(FEEDBACK_KEPT, Math.max(1, Number(req.query?.limit) || FEEDBACK_KEPT));
    const entries = await upstashFeedback(redisFromEnv(true)).read(limit);
    res.setHeader('Cache-Control', 'no-store');
    if (req.query?.format === 'json') return res.status(200).json(entries);
    // Sent as text rather than as a download: the usual way this is read is a
    // browser tab, and a file that lands in Downloads to be opened is a worse
    // version of that.
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.status(200).end(feedbackCsv(entries));
  } catch (error) {
    if (error instanceof NoDatabase) return failed(res, 503, 'Feedback is not set up yet.', error);
    failed(res, 503, 'The answers could not be reached.', error);
  }
}

/** Vercel parses a JSON body itself, but a string still arrives on some paths. */
function parse(body: unknown): Record<string, unknown> | null {
  if (typeof body === 'string') {
    try { return parse(JSON.parse(body)); } catch { return null; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
}
