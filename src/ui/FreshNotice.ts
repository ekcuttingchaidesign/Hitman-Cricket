import { track } from '../game/analytics';

/**
 * The question `?fresh=1` asks before it does anything.
 *
 * It is the whole of what makes that flag safe to put in a link. A link is a
 * thing people send each other, and one that wiped a career on sight would be a
 * prank with a cost. So the flag only ever opens this, and the destructive key
 * is the one that has to be pressed.
 *
 * Keeping is the drawn key and clearing is the outlined one, which is the
 * wrong way round for the person who typed the flag and the right way round for
 * the person who was sent it. Only one of those two can lose something here.
 *
 * The words say what survives, not only what goes, because what survives is the
 * reassuring half and the half somebody about to press this needs: the board
 * keeps every row, the name stays claimed, and a saved career key still opens
 * it. Somebody who does this and regrets it walks the restore path — which is
 * the journey the flag exists to let you walk on purpose.
 */
export function freshNotice(root: HTMLElement): Promise<boolean> {
  track('fresh-asked', 'Asked to start as a new player');
  const gate = document.createElement('div');
  gate.className = 'key-modal fresh-gate';
  gate.setAttribute('role', 'dialog');
  gate.setAttribute('aria-modal', 'true');
  gate.setAttribute('aria-labelledby', 'fresh-title');
  gate.innerHTML = `
    <div class="key-sheet">
      <div class="key-face">
        <h2 id="fresh-title">Start as a new player?</h2>
        <p class="key-sheet-say">This clears what this phone remembers — your name, your career
          and your career key. The game will open as though you had never played.</p>
        <p class="key-sheet-say">Your place on the board is not touched. The name stays yours,
          and a career key you have saved still brings all of it back.</p>
        <button id="fresh-keep" class="key-sheet-key is-whatsapp" type="button">KEEP MY RECORD</button>
        <button id="fresh-go" class="key-sheet-key is-copy" type="button">CLEAR THIS PHONE</button>
      </div>
    </div>`;
  root.appendChild(gate);
  return new Promise<boolean>(resolve => {
    const done = (cleared: boolean) => {
      track(cleared ? 'fresh-cleared' : 'fresh-kept',
        cleared ? 'Started again as a new player' : 'Kept the record on this device');
      gate.remove();
      resolve(cleared);
    };
    gate.querySelector<HTMLButtonElement>('#fresh-go')!.onclick = () => done(true);
    const keep = gate.querySelector<HTMLButtonElement>('#fresh-keep')!;
    keep.onclick = () => done(false);
    // The ground around it keeps the record too. The safe answer is the one a
    // stray press lands on, which is the right way round for a question whose
    // other answer cannot be undone from this screen.
    gate.onclick = event => { if (event.target === gate) done(false); };
    keep.focus();
  });
}
