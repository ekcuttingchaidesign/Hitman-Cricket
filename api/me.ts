// The `.js` on these is not a mistake and must not be tidied away — see the
// note at the top of `api/board.ts`. `scripts/function-check.mjs` is what keeps
// it honest.
import { forgetHeader, overHttps, ticketFrom, ticketHeader } from '../src/server/return-ticket.js';
import { cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';

/**
 * `POST /api/me` — this browser's id, name and kit, handed back as a cookie.
 * `POST /api/me?forget=1` — the same cookie, taken away.
 *
 * The whole of the return ticket's server half. Nothing is read from the
 * database and nothing is written to it: the body is checked for shape and
 * returned as a `Set-Cookie` on the browser that sent it, which is the one
 * thing a page cannot do for itself and have Safari keep. See
 * `src/server/return-ticket.ts` for why that matters.
 *
 * It hands nobody anything they did not send. The cookie goes back to the
 * browser that asked, carrying the id that browser already held, so there is
 * no question here of proving who somebody is.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return failed(res, 405, 'Use POST.');
  // A cookie is the answer, and a cached answer would hand one browser's
  // cookie to the next.
  res.setHeader('Cache-Control', 'no-store');
  const secure = overHttps(req.headers);

  if (req.query?.forget) {
    res.setHeader('Set-Cookie', forgetHeader(secure));
    return res.status(200).json({ ok: true });
  }

  const ticket = ticketFrom(parse(req.body));
  if (!ticket) return failed(res, 400, 'That is not a player.');
  res.setHeader('Set-Cookie', ticketHeader(ticket, secure));
  res.status(200).json({ ok: true });
}

/** Vercel parses a JSON body itself, but a string still arrives on some paths. */
function parse(body: unknown): Record<string, unknown> | null {
  if (typeof body === 'string') {
    try { return parse(JSON.parse(body)); } catch { return null; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
}
