import { DB_NAME, PLAYER_KEY } from './identity';

/**
 * Starting again as somebody this browser has never met.
 *
 * This exists because there was no honest way to test the thing the career key
 * is for. Who you are lives in three places at once — localStorage, a cookie
 * and IndexedDB — deliberately, so that one of them being cleared does not cost
 * a player their record. The same belt and braces makes "look at this as a new
 * player" a trip through the browser's settings, and a private window is no use
 * either: the game refuses to count an innings in one, so the whole path being
 * tested is shut before it starts.
 *
 * It is asked for by `?fresh=1` and it always asks back. A link is a thing
 * people send each other, and this one would cost a stranger their career if it
 * went through on sight. The question is the feature.
 *
 * What it clears is this device. The board keeps every row, the name stays
 * claimed, and the career key still opens it — so somebody who does this and
 * then wishes they had not can bring the record back, which is precisely the
 * journey it exists to let you walk.
 */

/** Every key the game writes begins with this, so nothing new has to be listed. */
const PREFIX = 'hitman-';

/** Whether the address asked for a clean slate. */
export function freshWanted(where: { search: string } = location): boolean {
  return new URLSearchParams(where.search).get('fresh') === '1';
}

/**
 * Takes the flag back off the address, so a reload is not a second question —
 * and so the link in somebody's history is not a trap they spring every time
 * they open it.
 */
export function forgetFreshFlag() {
  try {
    const url = new URL(location.href);
    url.searchParams.delete('fresh');
    history.replaceState(null, '', url.toString());
  } catch { /* An address this cannot parse is one nothing else read either. */ }
}

/**
 * Everything this browser knows about who is playing.
 *
 * By prefix rather than by name. There are sixteen keys today and the list will
 * be seventeen the first time somebody adds one, and a clean slate that quietly
 * stops being clean is worse than none — it would leave a "new" player holding
 * half an old one and make every test after it a lie.
 */
export async function clearThisDevice(): Promise<void> {
  wipe(() => localStorage);
  wipe(() => sessionStorage);
  // The cookie is host-only and set without a domain, so this is the same one.
  try {
    const secure = location.protocol === 'https:' ? ';Secure' : '';
    document.cookie = `${PLAYER_KEY}=;path=/;max-age=0;SameSite=Lax${secure}`;
  } catch { /* Then there was no cookie to take. */ }
  await dropDatabase();
}

function wipe(open: () => Storage) {
  try {
    const store = open();
    // Collected before anything is removed: taking a key out from under an
    // index-based walk skips its neighbour.
    const mine: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(PREFIX)) mine.push(key);
    }
    for (const key of mine) store.removeItem(key);
  } catch { /* Storage off, which is its own kind of clean. */ }
}

/**
 * The third copy. Given a moment and then given up on: a delete blocks while
 * another tab holds the database open, and a player left staring at a screen
 * that will not move is worse than one whose other tab kept a stale id.
 */
function dropDatabase(waitMs = 1500): Promise<void> {
  return new Promise<void>(done => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; done(); } };
    setTimeout(finish, waitMs);
    try {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = finish;
      request.onerror = finish;
      request.onblocked = finish;
    } catch { finish(); }
  });
}
