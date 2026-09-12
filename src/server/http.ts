import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * The few HTTP manners both endpoints need, in one place.
 *
 * The game does not necessarily live on the same origin as its API. It is
 * published to GitHub Pages today and the endpoints can only run on Vercel, so
 * until one host wins, the board is fetched across origins and the browser will
 * ask permission first. That is what the allowlist below is for — and it is an
 * allowlist rather than a `*` because `POST /api/score` writes.
 */

/** Origins the board may be fetched from. Add one here, not a wildcard. */
export const ALLOWED_ORIGINS = [
  'https://ekcuttingchaidesign.github.io',
  'https://hitman-cricket.vercel.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];

/**
 * Answers the browser's permission question, and says whether the real work
 * should be skipped. A preflight is an `OPTIONS` request the browser sends on
 * its own before a `POST` carrying JSON; it wants headers, not a board.
 */
export function cors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  // Same URL, different answer per origin — say so, or a shared cache will hand
  // one site's headers to another.
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method !== 'OPTIONS') return false;
  res.status(204).end();
  return true;
}

/**
 * Who is asking, as far as the edge can tell. Used to rate limit and for nothing
 * else: an address is not an identity, because a school, an office and everyone
 * behind CGNAT all arrive as one. The first entry in the chain is the client;
 * the rest are proxies.
 */
export function addressOf(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const chain = Array.isArray(forwarded) ? forwarded[0] : forwarded ?? '';
  return chain.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

/**
 * A failure the player will see. The message says what happened in words they
 * can act on; the detail goes to the log, where it is useful and harmless.
 */
export function failed(res: VercelResponse, status: number, reason: string, detail?: unknown) {
  if (detail) console.error(reason, detail);
  res.status(status).json({ error: reason });
}
