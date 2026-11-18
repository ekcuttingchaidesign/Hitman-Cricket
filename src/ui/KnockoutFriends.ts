/**
 * Super Knockout with friends: the way in and the lobby (Figma Battle Royale
 * page, section 54, V2b and the lobby with Around now, the owner's picks of
 * 18 November 2026; section 53 for the rest of the flow).
 *
 * Play with friends (`FriendsScreen`): join a friend's match by its code, ask
 * somebody around now straight in, or HOST A MATCH. The lobby (`LobbyScreen`):
 * the twelve seats filling, the code to read out, who is around to ask in with
 * one tap, and START NOW for the host or I'M READY for a guest, then the three
 * seconds every phone counts together to the walk-out.
 *
 * These only draw and say what was tapped; `Game` does the asking, through
 * `game/knockout-api.ts`.
 */
import { avatarSrc } from '../config/board';
import { cta, icon } from './Kit';
import { KNOCKOUT_HERO, KNOCKOUT_MARK } from './KnockoutHome';
import { MATCH_CODE_ALPHABET, MATCH_CODE_LENGTH, MATCH_SEATS, cleanMatchCode } from '../game/match-code';

/** Somebody around now, as the friends screen and the lobby list them. */
export interface AroundPlayer {
  handle: string;
  name: string;
  avatar: number;
  /** What they are batting, or null when they are only online. */
  batting: string | null;
  /** Asked into this match already. */
  sent: boolean;
}

const esc = (text: string) => text.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const face = (avatar: number, cls = '') => `<img class="${cls}" src="${avatarSrc(avatar)}" alt="" width="52" height="52" decoding="async">`;

function screen(id: string, label: string, body: string, keys: string): HTMLElement {
  const root = document.createElement('div');
  root.id = id;
  root.className = 'modal-overlay ko-screen ko-friends-screen hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', label);
  root.innerHTML = `<div class="ko-scroll">${body}</div><div class="ko-keys">${keys}</div>`;
  return root;
}

/**
 * Play with friends (1C, V2b): the picture and mark cut short, JOIN A FRIEND'S
 * MATCH with its four boxes, the people around now with INVITE each, and HOST
 * A MATCH under the thumb.
 */
export class FriendsScreen {
  readonly root: HTMLElement;
  private readonly input: HTMLInputElement;
  constructor(host: HTMLElement, private readonly keys: { back(): void; join(code: string): void; host(): void; invite(handle: string): void }) {
    this.root = screen('knockout-friends', 'Play with friends', `
      <div class="ko-hero is-short" aria-hidden="true"><img src="${KNOCKOUT_HERO}" alt="" decoding="async"></div>
      <div class="ko-grain" aria-hidden="true"></div>
      <div class="ko-top">
        <button id="ko-friends-back" class="k-icon-button" type="button" aria-label="Back">${icon('arrow-left')}</button>
        <span class="ko-top-title">PLAY WITH FRIENDS</span><span class="ko-top-gap"></span>
      </div>
      <div class="ko-friends-body">
        <img class="ko-mark is-small" src="${KNOCKOUT_MARK}" alt="Super Knockout" decoding="async">
        <form class="ko-card ko-join" id="ko-join" autocomplete="off">
          <b class="ko-join-title">JOIN A FRIEND’S MATCH</b>
          <span class="ko-join-line" id="ko-join-line">Enter the code your friend shared.</span>
          <span class="ko-join-row">
            <label class="ko-code" for="ko-join-code">
              ${Array.from({ length: MATCH_CODE_LENGTH }, (_, i) => `<i data-box="${i}"></i>`).join('')}
              <input id="ko-join-code" class="ko-code-input" type="text" inputmode="text" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="64" aria-label="Match code">
            </label>
            <button id="ko-join-go" class="ko-join-go" type="submit" disabled>JOIN</button>
          </span>
        </form>
        <h3 class="ko-around-head">AROUND NOW · INVITE STRAIGHT IN</h3>
        <ul class="ko-around-list" id="ko-friends-around"></ul>
        <p class="ko-note" id="ko-friends-note">INVITE hosts a match for you and sends them its code.</p>
      </div>`,
    `${cta({ kind: 'primary', label: 'HOST A MATCH', id: 'ko-host', moving: true })}<span class="ko-keys-line">You get a code to share · up to ${MATCH_SEATS} play</span>`);
    host.append(this.root);
    this.input = this.root.querySelector<HTMLInputElement>('#ko-join-code')!;
    this.root.querySelector<HTMLButtonElement>('#ko-friends-back')!.onclick = () => this.keys.back();
    this.root.querySelector<HTMLButtonElement>('#ko-host')!.onclick = () => this.keys.host();
    this.input.addEventListener('input', () => this.typed());
    this.root.querySelector<HTMLFormElement>('#ko-join')!.addEventListener('submit', event => {
      event.preventDefault();
      const code = cleanMatchCode(this.input.value);
      if (code) this.keys.join(code);
    });
    this.root.querySelector('#ko-friends-around')!.addEventListener('click', event => {
      const key = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-invite]');
      if (key && !key.disabled) { key.disabled = true; this.keys.invite(key.dataset.invite!); }
    });
  }
  get open() { return !this.root.classList.contains('hidden'); }
  show(around: readonly AroundPlayer[]) {
    this.root.classList.remove('hidden');
    this.error(null);
    this.around(around);
  }
  hide() { this.root.classList.add('hidden'); this.busy(false); }
  /** Who is around now, each with INVITE; a word to host and share when nobody is. */
  around(players: readonly AroundPlayer[]) {
    const list = this.root.querySelector('#ko-friends-around')!;
    list.innerHTML = players.length ? players.slice(0, 8).map(p => `
      <li class="ko-around-row" data-handle="${p.handle}">
        <span class="ko-around-face">${face(p.avatar)}<i class="ko-dot ${p.batting ? 'is-batting' : ''}"></i></span>
        <span class="ko-around-who"><b>${esc(p.name)}</b><span class="${p.batting ? 'is-batting' : ''}">${p.batting ? esc(p.batting) : 'Online'}</span></span>
        <button class="ko-pill ${p.sent ? 'is-sent' : ''}" type="button" data-invite="${p.handle}" ${p.sent ? 'disabled' : ''}>${p.sent ? 'SENT ✓' : 'INVITE'}</button>
      </li>`).join('')
      : '<li class="ko-around-none">Nobody’s around right now. Host a match and share its code.</li>';
    this.root.querySelector<HTMLElement>('#ko-friends-note')!.hidden = !players.length;
  }
  /** The code boxes keep up with what is typed; a whole link pasted in is read for its code. */
  private typed() {
    const raw = this.input.value;
    const code = (raw.length > MATCH_CODE_LENGTH ? cleanMatchCode(raw) : null) ?? [...raw.toUpperCase()].filter(ch => MATCH_CODE_ALPHABET.includes(ch)).join('').slice(0, MATCH_CODE_LENGTH);
    if (this.input.value !== code) this.input.value = code;
    this.root.querySelectorAll<HTMLElement>('.ko-code i').forEach((box, i) => {
      box.textContent = code[i] ?? '';
      box.classList.toggle('is-next', i === code.length);
    });
    this.root.querySelector<HTMLButtonElement>('#ko-join-go')!.disabled = code.length !== MATCH_CODE_LENGTH;
    this.error(null);
  }
  /** A code that is not a match (1E): the boxes shake once and go red, and the line says which code and what to do. */
  error(reason: string | null) {
    const card = this.root.querySelector<HTMLElement>('#ko-join')!, line = this.root.querySelector<HTMLElement>('#ko-join-line')!;
    card.classList.toggle('is-wrong', !!reason);
    line.textContent = reason ?? 'Enter the code your friend shared.';
    if (reason) { card.classList.remove('is-shake'); requestAnimationFrame(() => card.classList.add('is-shake')); }
  }
  busy(on: boolean) {
    this.root.classList.toggle('is-busy', on);
    this.root.querySelector<HTMLButtonElement>('#ko-host')!.disabled = on;
  }
  invited(handle: string) {
    const key = this.root.querySelector<HTMLButtonElement>(`[data-invite="${handle}"]`);
    if (key) { key.textContent = 'SENT ✓'; key.classList.add('is-sent'); key.disabled = true; }
  }
}

/** One seat in the lobby. */
export interface LobbySeat { handle: string; name: string; avatar: number; host: boolean; ready: boolean; you: boolean }
export interface LobbyView {
  code: string;
  seats: LobbySeat[];
  around: AroundPlayer[];
  /** This phone's player hosts it. */
  hosting: boolean;
  /** Their own say, as a guest. */
  ready: boolean;
  /** The host's name, for a guest's line. */
  hostName: string;
}

/**
 * The lobby (2A to 2D, with Around now): N OF 12 IN, the seats, the code, who
 * is around to ask in, and the keys — INVITE, and START NOW for the host or
 * I'M READY for a guest.
 */
export class LobbyScreen {
  readonly root: HTMLElement;
  private shown = '';
  constructor(host: HTMLElement, private readonly keys: { back(): void; share(): void; copy(): void; invite(handle: string): void; start(): void; ready(on: boolean): void }) {
    this.root = screen('knockout-lobby', 'Your match', `
      <div class="ko-lobby-glow" aria-hidden="true"></div>
      <div class="ko-grain" aria-hidden="true"></div>
      <div class="ko-top">
        <button id="ko-lobby-back" class="k-icon-button" type="button" aria-label="Leave the match">${icon('arrow-left')}</button>
        <span class="ko-top-title">YOUR MATCH</span>
        <button id="ko-lobby-share" class="k-icon-button" type="button" aria-label="Share the match">${icon('share')}</button>
      </div>
      <div class="ko-lobby-body">
        <h2 class="ko-lobby-count" id="ko-lobby-count">1 OF ${MATCH_SEATS} IN</h2>
        <p class="ko-lobby-line">Friends join with your code or link, or invite who’s around.</p>
        <ol class="ko-lseats" id="ko-seats"></ol>
        <div class="ko-card ko-codecard">
          <span><i>MATCH CODE · FRIENDS TYPE THIS IN</i><b id="ko-lobby-code">····</b></span>
          <button id="ko-lobby-copy" class="ko-pill is-quiet" type="button">COPY</button>
        </div>
        <h3 class="ko-around-head is-row">AROUND NOW</h3>
        <ul class="ko-around-strip" id="ko-lobby-around"></ul>
        <p class="ko-note" id="ko-lobby-note"></p>
      </div>
      <div class="ko-walkout hidden" id="ko-walkout" aria-live="assertive"><i>WALKING OUT IN</i><b id="ko-walkout-n">3</b></div>`,
    `<span class="ko-keys-pair">
      <button id="ko-lobby-invite" class="ko-friends ko-invite-key" type="button">${icon('share')}<span>INVITE</span></button>
      ${cta({ kind: 'primary', label: 'START NOW', id: 'ko-lobby-start', moving: true })}
      <button id="ko-lobby-ready" class="ko-friends ko-ready-key hidden" type="button"><span>I’M READY</span></button>
    </span>`);
    host.append(this.root);
    const on = (id: string, fn: () => void) => { this.root.querySelector<HTMLButtonElement>(`#${id}`)!.onclick = fn; };
    on('ko-lobby-back', () => this.keys.back());
    on('ko-lobby-share', () => this.keys.share());
    on('ko-lobby-invite', () => this.keys.share());
    on('ko-lobby-copy', () => this.keys.copy());
    on('ko-lobby-start', () => this.keys.start());
    on('ko-lobby-ready', () => this.keys.ready(!this.root.querySelector('#ko-lobby-ready')!.classList.contains('is-ready')));
    this.root.querySelector('#ko-seats')!.addEventListener('click', event => {
      if ((event.target as HTMLElement).closest('.ko-lseat.is-empty.is-first')) this.keys.share();
    });
    this.root.querySelector('#ko-lobby-around')!.addEventListener('click', event => {
      const key = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-invite]');
      if (key && !key.disabled) { key.disabled = true; key.textContent = 'SENT ✓'; key.classList.add('is-sent'); this.keys.invite(key.dataset.invite!); }
    });
  }
  get open() { return !this.root.classList.contains('hidden'); }
  hide() { this.root.classList.add('hidden'); this.walkOut(null); this.shown = ''; }
  render(view: LobbyView) {
    this.root.classList.remove('hidden');
    const key = JSON.stringify(view);
    if (key === this.shown) return;
    this.shown = key;
    this.root.querySelector('#ko-lobby-code')!.textContent = view.code.split('').join(' ');
    this.root.querySelector('#ko-lobby-count')!.textContent = `${view.seats.length} OF ${MATCH_SEATS} IN`;
    const seats = this.root.querySelector('#ko-seats')!;
    const known = new Set([...seats.querySelectorAll<HTMLElement>('[data-handle]')].map(el => el.dataset.handle));
    seats.innerHTML = Array.from({ length: MATCH_SEATS }, (_, i) => {
      const seat = view.seats[i];
      if (!seat) return `<li class="ko-lseat is-empty${i === view.seats.length ? ' is-first' : ''}">${i === view.seats.length ? '<i class="ko-lseat-plus">+</i><span>Invite</span>' : ''}</li>`;
      const arrived = known.size && !known.has(seat.handle) ? ' is-arriving' : '';
      return `<li class="ko-lseat${seat.you ? ' is-you' : ''}${seat.ready ? ' is-ready' : ''}${arrived}" data-handle="${seat.handle}">
        <span class="ko-lseat-face">${face(seat.avatar)}${seat.host ? '<i class="ko-lseat-host">HOST</i>' : seat.ready ? '<i class="ko-lseat-tick">✓</i>' : ''}</span>
        <span class="ko-lseat-name">${seat.you ? 'You' : esc(seat.name)}</span></li>`;
    }).join('');
    const around = view.around.filter(p => !view.seats.some(s => s.handle === p.handle));
    this.root.querySelector('#ko-lobby-around')!.innerHTML = around.length ? around.slice(0, 12).map(p => `
      <li class="ko-around-cell"><span class="ko-around-face">${face(p.avatar)}<i class="ko-dot ${p.batting ? 'is-batting' : ''}"></i></span>
        <b>${esc(p.name)}</b>
        <button class="ko-pill is-small ${p.sent ? 'is-sent' : ''}" type="button" data-invite="${p.handle}" ${p.sent ? 'disabled' : ''}>${p.sent ? 'SENT ✓' : 'INVITE'}</button></li>`).join('')
      : '<li class="ko-around-none">Nobody else is around. Share the code.</li>';
    const friends = view.seats.length - 1;
    const start = this.root.querySelector<HTMLButtonElement>('#ko-lobby-start')!, ready = this.root.querySelector<HTMLButtonElement>('#ko-lobby-ready')!;
    start.classList.toggle('hidden', !view.hosting);
    ready.classList.toggle('hidden', view.hosting);
    start.disabled = friends < 1;
    ready.classList.toggle('is-ready', view.ready);
    ready.querySelector('span')!.textContent = view.ready ? 'READY ✓' : 'I’M READY';
    this.root.querySelector('#ko-lobby-note')!.textContent = view.hosting
      ? (friends < 1 ? 'START NOW wakes up when one friend is in. Empty seats get subs.' : `${view.seats.filter(s => s.ready).length} of ${view.seats.length} ready · empty seats get subs`)
      : `Waiting for ${view.hostName} to start.`;
  }
  /** The three seconds every phone counts together (3B), or put away. */
  walkOut(n: number | null) {
    const panel = this.root.querySelector<HTMLElement>('#ko-walkout')!;
    panel.classList.toggle('hidden', n === null);
    if (n !== null) {
      const figure = this.root.querySelector<HTMLElement>('#ko-walkout-n')!;
      if (figure.textContent !== String(n)) { figure.textContent = String(n); figure.classList.remove('is-tick'); requestAnimationFrame(() => figure.classList.add('is-tick')); }
    }
  }
}
