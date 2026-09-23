import type { KeyView } from '../ui/CareerKey';

/**
 * The career key, as this browser holds it.
 *
 * What is kept here is the key itself, in the clear, which is the right place
 * for it and the only one: the store keeps a salted hash and cannot produce a
 * key it was given, so if this browser does not hold it nobody can show it
 * again. That is the point — a key that could be re-read from the server would
 * be a key a stolen session could read too — and it is also why the widget
 * exists at all. The player is being asked to put it somewhere that is not a
 * browser, because a browser is the thing that forgets.
 *
 * Whether it has been saved is kept beside it and is only ever a guess. We
 * know a save sheet was opened and a key pressed; we do not know what happened
 * in WhatsApp afterwards. So a saved key keeps its widget, quieter — a record
 * that says "saved" is not evidence, and the one player it would fail is the
 * one who needs it most.
 */

const KEY = 'hitman-career-key';

interface Held {
  code: string;
  saved: boolean;
}

function read(): Held | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const held = JSON.parse(raw) as Partial<Held>;
    const code = typeof held.code === 'string' ? held.code.trim() : '';
    return code ? { code, saved: held.saved === true } : null;
  } catch {
    // Storage off, or something that is not JSON. No key here, which the
    // 'lost' state is the honest way to say.
    return null;
  }
}

function write(held: Held) {
  try { localStorage.setItem(KEY, JSON.stringify(held)); } catch { /* Then it is lost. */ }
}

/** A key just issued, kept so the player can be shown it more than once. */
export function keepKey(code: string) {
  const had = read();
  // A key that arrives again is the same key: keep what we knew about saving
  // it rather than asking somebody to save what they have already saved.
  write({ code, saved: had?.code === code ? had.saved : false });
}

/** They opened the sheet and pressed a key. As close to saved as we can get. */
export function markKeySaved() {
  const held = read();
  if (held) write({ ...held, saved: true });
}

/** A key replaced, or a record brought back that this browser has no key for. */
export function forgetKey() {
  try { localStorage.removeItem(KEY); } catch { /* Nothing to forget. */ }
}

/**
 * What the widget should show, for a player who has claimed a name.
 *
 * Null where no name is claimed: a record comes back with a name and a key
 * together, so a key held by nobody opens nothing and a widget about one is a
 * lifeline with the far end tied to air.
 *
 * `lost` is the honest answer where a name is held and this browser has no key
 * for it — after restoring on a new phone, or after storage was cleared but
 * the name survived. A key is shown once and kept nowhere else, so it cannot
 * be produced again; saying so, and offering another, is the only truthful
 * screen.
 */
export function keyView(named: boolean): KeyView | null {
  if (!named) return null;
  const held = read();
  if (!held) return { state: 'lost', code: null };
  return { state: held.saved ? 'saved' : 'unsaved', code: held.code };
}
