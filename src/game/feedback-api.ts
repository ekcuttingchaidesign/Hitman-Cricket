import { cleanAnswers, cleanContext, cleanSuggestion, type FeedbackAnswers, type FeedbackContext } from './feedback';

/**
 * The questionnaire, sent.
 *
 * The same two rules the board is fetched under, for the same reasons. It is on
 * a short leash, because nobody is going to watch a spinner after answering ten
 * questions about a cricket game. And a failure is an answer rather than an
 * exception: the form tells them it could not be sent and keeps what they said,
 * which is the only honest thing to do with an opinion somebody has already
 * given you.
 */

/** Where the endpoints live — the same origin as the game, unless a build says otherwise. */
const API = import.meta.env.VITE_BOARD_API ?? '';

/** How long it gets before the form stops waiting. */
const TIMEOUT_MS = 6000;

export interface FeedbackPayload {
  playerId: string | null;
  answers: FeedbackAnswers;
  suggestion: string;
  context: FeedbackContext;
}

export interface FeedbackSent {
  ok: boolean;
  /** Why it was turned down, in words that can be read out on the form. */
  reason?: string;
}

/**
 * Sends it. Cleaned here as well as in the endpoint — not because the endpoint
 * is doubted, but because the two run the same functions over the same list, so
 * anything this drops is something the endpoint would have dropped anyway and
 * the request is that much smaller for it.
 */
export async function sendFeedback(payload: FeedbackPayload): Promise<FeedbackSent> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: stop.signal,
      body: JSON.stringify({
        playerId: payload.playerId ?? '',
        answers: cleanAnswers(payload.answers),
        suggestion: cleanSuggestion(payload.suggestion),
        context: cleanContext(payload.context),
      }),
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (response.ok) return { ok: true };
    // Only the endpoint's own `failed` writes `error`, and every message it
    // writes is already in words a person can read.
    return { ok: false, reason: body?.error ?? 'That could not be sent.' };
  } catch {
    return { ok: false, reason: 'That could not be sent — check your connection.' };
  } finally {
    clearTimeout(timer);
  }
}
