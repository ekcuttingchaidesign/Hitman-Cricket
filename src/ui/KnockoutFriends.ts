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
import crownUrl from '../assets/knockout/crown.svg';
import { MATCH_CODE_ALPHABET, MATCH_CODE_LENGTH, MATCH_SEATS, cleanMatchCode, codeIn, namesOf } from '../game/match-code';
import { buzz } from '../game/haptics';

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
        <ul class="ko-invites" id="ko-friends-invites" hidden></ul>
        <form class="ko-card ko-join" id="ko-join" autocomplete="off">
          <span class="ko-join-head"><b class="ko-join-title">JOIN A FRIEND’S MATCH</b>
            <button id="ko-join-paste" class="ko-pill is-quiet" type="button">PASTE</button></span>
          <span class="ko-join-line" id="ko-join-line">Enter the code your friend shared.</span>
          <span class="ko-join-row">
            <label class="ko-code" for="ko-join-code">
              ${Array.from({ length: MATCH_CODE_LENGTH }, (_, i) => `<i data-box="${i}"></i>`).join('')}
              <input id="ko-join-code" class="ko-code-input" type="text" inputmode="text" autocapitalize="characters" autocorrect="off" spellcheck="false" aria-label="Match code">
            </label>
            <button id="ko-join-go" class="ko-join-go" type="submit" disabled><span>JOIN</span></button>
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
    // Pasted into the boxes: the code is read out of whatever came with it (a link, INVITE's whole line), and joined.
    this.input.addEventListener('paste', event => {
      const text = event.clipboardData?.getData('text');
      if (text === undefined) return;
      event.preventDefault();
      this.pasted(text);
    });
    // PASTE: a phone's long press on four boxes is hard to find, so the clipboard is read for them.
    const paste = this.root.querySelector<HTMLButtonElement>('#ko-join-paste')!;
    paste.hidden = !navigator.clipboard?.readText;
    paste.onclick = () => {
      void navigator.clipboard.readText().then(text => this.pasted(text),
        () => { paste.hidden = true; this.input.focus(); this.error('Paste wasn’t allowed here. Tap the boxes and type the code.'); });
    };
    this.root.querySelector<HTMLFormElement>('#ko-join')!.addEventListener('submit', event => {
      event.preventDefault();
      const code = cleanMatchCode(this.input.value);
      if (code) this.keys.join(code);
    });
    this.root.querySelector('#ko-friends-invites')!.addEventListener('click', event => {
      const key = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-join]');
      if (key && !key.disabled) { key.disabled = true; this.keys.join(key.dataset.join!); }
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
  /** Something pasted: its code in the boxes and joined, or said plainly that there was none. */
  private pasted(text: string) {
    const code = codeIn(text);
    if (!code) { this.error(text.trim() ? 'No match code in what you pasted. Copy the code again.' : 'Nothing copied yet. Copy the code first.'); return; }
    this.input.value = code;
    this.typed();
    this.keys.join(code);
  }
  /** Matches this player has been asked into, at the head of the screen with JOIN each: an invite missed as a banner is still here. */
  invites(list: readonly InviteRow[]) {
    const host = this.root.querySelector<HTMLElement>('#ko-friends-invites')!;
    host.hidden = !list.length;
    host.innerHTML = list.map(invite => `
      <li class="ko-card ko-invite-row">
        <span class="ko-around-face">${face(invite.byAvatar)}</span>
        <span class="ko-around-who"><b>${esc(invite.by)} invited you</b><span>${invite.size} in the room · code ${esc(invite.code)}</span></span>
        <button class="ko-pill" type="button" data-join="${esc(invite.code)}">JOIN</button>
      </li>`).join('');
  }
  /** The code boxes keep up with what is typed; anything longer than a code (a link typed or dropped in) is read for one. */
  private typed() {
    const raw = this.input.value;
    const code = (raw.length > MATCH_CODE_LENGTH ? codeIn(raw) : null) ?? [...raw.toUpperCase()].filter(ch => MATCH_CODE_ALPHABET.includes(ch)).join('').slice(0, MATCH_CODE_LENGTH);
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
export interface LobbySeat {
  handle: string; name: string; avatar: number; host: boolean; ready: boolean; you: boolean;
  /** Batting the match being played. */
  playing?: boolean;
  /** When they came into the room, by the store's clock: the host's sheet says how long ago. */
  joined?: number;
  /** While a match is on, on a phone that batted in it: their score, and whether a tap opens their game. */
  score?: string;
  watch?: boolean;
  /** Out of the match being played: Out, or Out · 9th once a cut has placed them. */
  out?: string;
}
/** Somebody still in a match being played, for the room's strip of story rings. */
export interface LobbyRing { id: number; name: string; face: number; out: boolean }
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
  /** A match is being played: those batting it are tagged PLAYING, and the next waits for them. */
  live?: boolean;
  /** How many are still batting it. */
  playing?: number;
  /** The store's clock, for how long somebody has been in the room. */
  now?: number;
  /** When the host last nudged this player to say I'M READY (the store's clock); 0 for never. */
  nudged?: number;
  /**
   * A match being played that this phone can watch (its player batted in it and is back in the room, section 57):
   * what the room says of it, and everybody still in as story rings.
   */
  match?: { heading: string; line: string; rings: LobbyRing[] } | null;
  /** The match that just ended in this room: who won it and where this player came. */
  last?: { title: string; line: string; face: number } | null;
  /**
   * What the next match is worth as the room stands (the store's figure): first place's points, or none with how many
   * real players it takes before a match pays.
   */
  worth?: { first: number; from: number } | null;
}

/** A match somebody asked this player into. */
export interface InviteRow { code: string; by: string; byAvatar: number; size: number }

interface LobbyKeys {
  back(): void; share(): void; copy(): void; invite(handle: string): void; start(): void; ready(on: boolean): void;
  /** The host's nudge: somebody not ready by handle, or everybody who is not. */
  nudge(handle?: string): void;
  /** The host takes somebody out of the match. */
  remove(handle: string): void;
  /** A friend's seat tagged PLAYING, tapped: their game as a story. */
  watchSeat(handle: string): void;
  /** A ring in the STILL IN strip (null: whoever leads), tapped. */
  watchRing(id: number | null): void;
  /** LEADERBOARD: the match being played as it stands, or the last one's Results. */
  board(): void;
  lastBoard(): void;
}

const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * The lobby (2A to 2D, with Around now): N OF 12 IN, who is in, the code, who
 * is around to ask in, and the keys — INVITE, and START NOW for the host or
 * I'M READY for a guest.
 *
 * Drawn for the people in it (Figma sections 56 and 57 as redrawn, the owner
 * finding the first cut cluttered and the players cramped, 19 November 2026):
 * only those who have joined, big and four to a row, an Invite tile after
 * them, a plain word under each name (Host, Ready, Not ready) and a green tick
 * on a ready face; six to a row once a ninth tile is wanted. One line under
 * the count says where the room stands, with the host's NUDGE beside it;
 * nothing stands over the keys. The code is one slim row and Around now one
 * line of chips, a tap asking that player in.
 *
 * Everybody ready before the start (section 56): START NOW sleeps until every
 * friend in the room has said I'M READY. A tap on a friend's face is the
 * host's sheet (NUDGE, REMOVE FROM MATCH), and a nudge reaches a guest as a
 * banner with a buzz.
 *
 * Watching from the room (section 57): while a match is on, a phone whose
 * player batted in it shows everybody still batting in the story ring with
 * their score, a tap opening their game; the end screen's strip of rings
 * stands where AROUND NOW was, with LEADERBOARD; and the hero key is WATCH.
 * Once it is over one card keeps who won it.
 */
export class LobbyScreen {
  readonly root: HTMLElement;
  private shown = '';
  private view: LobbyView | null = null;
  private sheetFor: string | null = null;
  /** The last nudge this phone has shown, by the store's clock; taken from the first look so an old one is never told. */
  private nudgeSeen: number | null = null;
  private nudgeDown = 0;
  private nudgedAt = new Map<string, number>();
  private allReady = false;
  constructor(host: HTMLElement, private readonly keys: LobbyKeys) {
    this.root = screen('knockout-lobby', 'Your match', `
      <div class="ko-lobby-glow" aria-hidden="true"></div>
      <div class="ko-grain" aria-hidden="true"></div>
      <div class="ko-top">
        <button id="ko-lobby-back" class="k-icon-button" type="button" aria-label="Leave the match">${icon('arrow-left')}</button>
        <span class="ko-top-title">YOUR MATCH</span>
        <button id="ko-lobby-share" class="k-icon-button" type="button" aria-label="Share the match">${icon('share')}</button>
      </div>
      <div class="ko-lobby-body">
        <div class="ko-lobby-head">
          <h2 class="ko-lobby-count" id="ko-lobby-count">1 OF ${MATCH_SEATS} IN</h2>
          <span class="ko-worth hidden" id="ko-lobby-worth"></span>
        </div>
        <div class="ko-lobby-status">
          <p class="ko-lobby-line" id="ko-lobby-note">Share the code, or invite who’s around.</p>
          <button id="ko-lobby-nudge" class="ko-mini hidden" type="button"><span>${icon('bell')}<b>NUDGE</b></span></button>
        </div>
        <ol class="ko-people" id="ko-seats"></ol>
        <div class="ko-card ko-coderow">
          <i>MATCH CODE</i><b id="ko-lobby-code">····</b>
          <button id="ko-lobby-copy" class="ko-pill is-quiet is-small" type="button">COPY</button>
        </div>
        <div class="ko-last hidden" id="ko-lobby-last">
          <span class="ko-last-face"><img class="ko-last-crown" src="${crownUrl}" alt="" decoding="async"><img id="ko-last-face" alt="" width="46" height="46" decoding="async"></span>
          <span class="ko-last-text"><i>LAST MATCH</i><b id="ko-last-title"></b><small id="ko-last-line"></small></span>
          <button id="ko-lobby-last-board" class="ko-mini" type="button"><span><b>LEADERBOARD</b></span></button>
        </div>
        <div class="ko-still hidden" id="ko-lobby-still">
          <p class="ko-still-head"><span>STILL IN · TAP TO WATCH</span><button id="ko-lobby-board" type="button">LEADERBOARD ›</button></p>
          <div class="ko-rings-row" id="ko-lobby-rings" role="list"></div>
        </div>
        <div id="ko-lobby-aroundwrap">
          <h3 class="ko-around-head is-row">AROUND NOW · TAP TO INVITE</h3>
          <ul class="ko-chips" id="ko-lobby-around"></ul>
        </div>
      </div>
      <div class="ko-walkout hidden" id="ko-walkout" aria-live="assertive"><i>WALKING OUT IN</i><b id="ko-walkout-n">3</b></div>`,
    `<span class="ko-keys-pair">
      <button id="ko-lobby-invite" class="ko-friends ko-invite-key" type="button">${icon('share')}<span>INVITE</span></button>
      ${cta({ kind: 'primary', label: 'START NOW', id: 'ko-lobby-start', moving: true })}
      ${cta({ kind: 'primary', label: 'I’M READY', id: 'ko-lobby-ready', moving: true })}
      ${cta({ kind: 'primary', label: 'WATCH', id: 'ko-lobby-watch', moving: true })}
    </span>`);
    this.root.insertAdjacentHTML('beforeend', `
      <div class="ko-nudge hidden" id="ko-nudge" role="status">
        <img alt="" width="40" height="40" decoding="async">
        <span class="ko-invite-text"><b id="ko-nudge-title"></b><small>Tap I’M READY to play</small></span>
        <button class="ko-invite-x" id="ko-nudge-x" type="button" aria-label="Dismiss">×</button>
      </div>
      <div class="ko-sheet-scrim hidden" id="ko-seat-sheet">
        <div class="ko-sheet" role="dialog" aria-modal="true" aria-labelledby="ko-sheet-title">
          <i class="ko-sheet-grip" aria-hidden="true"></i>
          <div class="ko-sheet-head"><img alt="" width="56" height="56" decoding="async"><span><b id="ko-sheet-title"></b><small id="ko-sheet-line"></small></span></div>
          ${cta({ kind: 'primary', label: 'NUDGE', id: 'ko-sheet-nudge' })}
          <button id="ko-sheet-remove" class="ko-friends ko-remove-key" type="button"><span>REMOVE FROM MATCH</span></button>
          <p class="ko-sheet-note">A nudge buzzes their phone and puts a banner over their screen: one every ten seconds. Taken out, they can come back once with the link.</p>
        </div>
      </div>`);
    host.append(this.root);
    // A guest's key is the hero as the host's START NOW is: as a dark key beside a green INVITE it read as switched off.
    this.root.querySelector('#ko-lobby-ready')!.classList.add('ko-ready-key', 'hidden');
    this.root.querySelector('#ko-lobby-watch')!.classList.add('hidden');
    const on = (id: string, fn: () => void) => { this.root.querySelector<HTMLButtonElement>(`#${id}`)!.onclick = fn; };
    on('ko-lobby-back', () => this.keys.back());
    on('ko-lobby-share', () => this.keys.share());
    on('ko-lobby-invite', () => this.keys.share());
    on('ko-lobby-copy', () => this.keys.copy());
    on('ko-lobby-start', () => this.keys.start());
    on('ko-lobby-ready', () => this.keys.ready(!this.root.querySelector('#ko-lobby-ready')!.classList.contains('is-ready')));
    on('ko-lobby-watch', () => this.keys.watchRing(null));
    on('ko-lobby-board', () => this.keys.board());
    on('ko-lobby-last-board', () => this.keys.lastBoard());
    on('ko-lobby-nudge', () => this.nudge());
    on('ko-nudge-x', () => this.nudgeBanner(null));
    on('ko-sheet-nudge', () => { if (this.sheetFor) this.nudge(this.sheetFor); this.sheet(null); });
    on('ko-sheet-remove', () => { const who = this.sheetFor; this.sheet(null); if (who) this.keys.remove(who); });
    this.root.querySelector<HTMLElement>('#ko-seat-sheet')!.onclick = event => { if (event.target === event.currentTarget) this.sheet(null); };
    const people = this.root.querySelector<HTMLElement>('#ko-seats')!;
    const pick = (target: HTMLElement) => {
      if (target.closest('.ko-lseat.is-invite')) { this.keys.share(); return; }
      const seat = target.closest<HTMLElement>('.ko-lseat[data-handle]');
      if (!seat) return;
      if (seat.classList.contains('is-watch')) this.keys.watchSeat(seat.dataset.handle!);
      else if (seat.classList.contains('is-tap')) this.sheet(seat.dataset.handle!);
    };
    people.addEventListener('click', event => pick(event.target as HTMLElement));
    people.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault(); pick(event.target as HTMLElement);
    });
    this.root.querySelector('#ko-lobby-rings')!.addEventListener('click', event => {
      const ring = (event.target as HTMLElement).closest<HTMLElement>('[data-ring]');
      if (ring && !ring.classList.contains('is-out')) this.keys.watchRing(Number(ring.dataset.ring));
    });
    this.root.querySelector('#ko-lobby-around')!.addEventListener('click', event => {
      const key = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-invite]');
      if (!key || key.disabled) return;
      key.disabled = true; key.classList.add('is-sent');
      key.querySelector('i')!.textContent = '✓';
      key.setAttribute('aria-label', `Invited ${key.querySelector('b')!.textContent}`);
      this.keys.invite(key.dataset.invite!);
    });
  }
  get open() { return !this.root.classList.contains('hidden'); }
  hide() { this.root.classList.add('hidden'); this.walkOut(null); this.shown = ''; this.sheet(null); this.nudgeBanner(null); }
  /** Put away for good (the room left): the next room starts with nothing remembered of this one. */
  forget() { this.nudgeSeen = null; this.nudgedAt.clear(); this.allReady = false; this.view = null; }
  /** The host's nudge, one player's or everybody's: the key says so for as long as the store would turn another away. */
  private nudge(handle?: string) {
    this.keys.nudge(handle);
    const now = Date.now();
    for (const seat of this.view?.seats ?? []) if (!seat.host && !seat.ready && (!handle || seat.handle === handle)) this.nudgedAt.set(seat.handle, now);
    this.status();
    window.setTimeout(() => this.status(), 10_100);
  }
  /** The host's sheet for a friend (A2), or put away. */
  private sheet(handle: string | null) {
    const scrim = this.root.querySelector<HTMLElement>('#ko-seat-sheet')!;
    const seat = handle ? this.view?.seats.find(s => s.handle === handle) : null;
    this.sheetFor = seat ? seat.handle : null;
    scrim.classList.toggle('hidden', !seat);
    if (!seat || !this.view) return;
    const name = seat.name.toUpperCase();
    scrim.querySelector('img')!.src = avatarSrc(seat.avatar);
    scrim.querySelector('#ko-sheet-title')!.textContent = seat.ready ? `${name} IS READY` : `${name} ISN’T READY`;
    const here = seat.joined && this.view.now ? `In the room for ${clock(this.view.now - seat.joined)}` : 'In the room';
    scrim.querySelector('#ko-sheet-line')!.textContent = seat.ready ? `${here} · ready to play` : `${here} · hasn’t tapped I’M READY`;
    const nudge = scrim.querySelector<HTMLButtonElement>('#ko-sheet-nudge')!;
    nudge.classList.toggle('hidden', seat.ready);
    nudge.querySelector('.k-cta-face>span')!.textContent = `NUDGE ${name}`;
    scrim.querySelector<HTMLElement>('.ko-sheet-note')!.textContent = seat.ready
      ? 'Taken out, they can come back once with the link.'
      : 'A nudge buzzes their phone and puts a banner over their screen: one every ten seconds. Taken out, they can come back once with the link.';
  }
  /** A nudge from the host, on a guest's phone (A3): a banner and a buzz, away by itself or once they are ready. */
  private nudgeBanner(view: LobbyView | null) {
    const banner = this.root.querySelector<HTMLElement>('#ko-nudge')!;
    window.clearTimeout(this.nudgeDown);
    if (!view) { banner.classList.add('hidden'); return; }
    const host = view.seats.find(s => s.host);
    banner.querySelector('img')!.src = avatarSrc(host?.avatar ?? 0);
    banner.querySelector('#ko-nudge-title')!.textContent = `${view.hostName} is waiting for you`;
    banner.classList.remove('hidden', 'is-in'); requestAnimationFrame(() => banner.classList.add('is-in'));
    buzz([40, 60, 40]);
    this.nudgeDown = window.setTimeout(() => banner.classList.add('hidden'), 8000);
  }
  /**
   * The one line under the count: where the room stands, in the colour of it (amber while somebody is waited for, green
   * once everybody is ready), with the host's NUDGE beside it. It was three things, a line here, a tag on every face and
   * a bar over the keys, and the room read as cluttered.
   */
  private status() {
    const view = this.view;
    if (!view) return;
    const match = view.match ?? null, live = !!view.live;
    const friends = view.seats.filter(s => !s.host), waiting = friends.filter(s => !s.ready);
    const others = waiting.filter(s => !s.you), batting = view.playing ?? 0;
    let line = '', tone = '', canNudge = false;
    if (match) line = match.line;
    else if (live) line = batting ? `${batting} still batting this match. The next one starts when it’s over.` : 'The match is over. Back to the lobby in a moment.';
    else if (!friends.length) line = view.hosting ? 'Share the code, or invite who’s around.' : `${view.hostName} starts when everyone’s ready`;
    else if (view.hosting) {
      if (waiting.length) { line = `Waiting for ${namesOf(waiting.map(s => s.name))}`; tone = 'is-waiting'; canNudge = true; }
      else { line = 'Everybody’s ready · subs fill the empty seats'; tone = 'is-good'; }
    } else if (!view.ready) { line = `${view.hostName} is waiting for you to be ready`; tone = 'is-waiting'; }
    else if (others.length) line = `Waiting for ${namesOf(others.map(s => s.name))}`;
    else { line = `Everybody’s ready · waiting for ${view.hostName} to start`; tone = 'is-good'; }
    const note = this.root.querySelector<HTMLElement>('#ko-lobby-note')!;
    note.textContent = line;
    note.className = `ko-lobby-line${tone ? ` ${tone}` : ''}`;
    // NUDGE for everybody not ready at once; said as done while the store would turn another away.
    const nudge = this.root.querySelector<HTMLButtonElement>('#ko-lobby-nudge')!;
    const fresh = waiting.some(s => Date.now() - (this.nudgedAt.get(s.handle) ?? 0) >= 10_000);
    nudge.classList.toggle('hidden', !canNudge);
    nudge.disabled = !fresh;
    nudge.querySelector('b')!.textContent = fresh ? 'NUDGE' : 'NUDGED ✓';
    nudge.classList.toggle('is-sent', !fresh);
  }
  render(view: LobbyView) {
    this.root.classList.remove('hidden');
    // The nudge is a moment, not a state: told when it is newer than the last one shown, whatever else has changed.
    if (this.nudgeSeen === null) this.nudgeSeen = view.nudged ?? 0;
    else if ((view.nudged ?? 0) > this.nudgeSeen) { this.nudgeSeen = view.nudged!; if (!view.hosting && !view.ready && !view.live) this.nudgeBanner(view); }
    if (view.ready || view.live) this.root.querySelector('#ko-nudge')!.classList.add('hidden');
    // The store's clock moves with every answer: it is not what the screen is drawn from, only the sheet's "in the room for".
    const key = JSON.stringify({ ...view, now: 0 });
    this.view = view;
    if (this.sheetFor) this.sheet(this.sheetFor);
    if (key === this.shown) return;
    this.shown = key;
    const match = view.match ?? null, live = !!view.live;
    const friends = view.seats.filter(s => !s.host), waiting = friends.filter(s => !s.ready);
    const everybody = !live && friends.length > 0 && !waiting.length;
    this.root.querySelector('#ko-lobby-code')!.textContent = view.code.split('').join(' ');
    const count = this.root.querySelector<HTMLElement>('#ko-lobby-count')!;
    count.textContent = match ? match.heading : `${view.seats.length} OF ${MATCH_SEATS} IN`;
    count.classList.toggle('is-match', !!match);
    // What the match is worth, beside the count: gold once it pays, grey with what it takes while it does not.
    const worth = this.root.querySelector<HTMLElement>('#ko-lobby-worth')!;
    const pays = !!view.worth && view.worth.first > 0;
    worth.classList.toggle('hidden', !view.worth || live);
    worth.classList.toggle('is-gold', pays);
    if (view.worth) worth.textContent = pays ? `UP TO ${view.worth.first} POINTS` : `POINTS FROM ${view.worth.from} PLAYERS`;
    const seats = this.root.querySelector<HTMLElement>('#ko-seats')!;
    const known = new Set([...seats.querySelectorAll<HTMLElement>('[data-handle]')].map(el => el.dataset.handle));
    // Only the people who are in, with one Invite tile after them: twelve seats drawn, most of them empty, left the ones
    // taken small. Four to a row while two rows hold them, six once a ninth tile is wanted.
    const asking = !live && view.seats.length < MATCH_SEATS;
    seats.classList.toggle('is-many', view.seats.length + (asking ? 1 : 0) > 8);
    seats.innerHTML = view.seats.map(seat => {
      const arrived = known.size && !known.has(seat.handle) ? ' is-arriving' : '';
      const ready = !live && !seat.host && seat.ready, unready = !live && !seat.host && !seat.ready;
      const out = live && !!seat.out;
      // Under the name, a plain word: while a match is on, how they are going in it; otherwise where they stand for the next.
      const [word, kind] = seat.playing ? [seat.score ? `${seat.score} · batting` : 'Batting', 'playing']
        : out ? [seat.out!, 'out']
        : seat.host ? ['Host', 'host']
        : live ? ['In the room', 'host']
        : seat.ready ? ['Ready', 'ready'] : ['Not ready', 'not'];
      const tap = view.hosting && !seat.you && !live;
      const cls = `${seat.you ? ' is-you' : ''}${ready ? ' is-ready' : ''}${unready ? ' is-not-ready' : ''}${seat.playing ? ' is-playing' : ''}`
        + `${out ? ' is-out' : ''}${seat.watch ? ' is-watch' : ''}${tap ? ' is-tap' : ''}${arrived}`;
      const said = seat.you ? 'You' : esc(seat.name);
      const act = seat.watch || tap ? ` role="button" tabindex="0" aria-label="${seat.watch ? `Watch ${esc(seat.name)}` : `${esc(seat.name)}, ${word}`}"` : '';
      return `<li class="ko-lseat${cls}" data-handle="${seat.handle}"${act}>
        <span class="ko-lseat-face">${face(seat.avatar)}${ready ? '<i class="ko-lseat-tick" aria-hidden="true">✓</i>' : ''}</span>
        <b class="ko-lseat-name">${said}</b><small class="ko-lseat-sub is-${kind}">${esc(word)}</small></li>`;
    }).join('') + (asking ? '<li class="ko-lseat is-invite" role="button" tabindex="0" aria-label="Invite a friend"><span class="ko-lseat-face"><i class="ko-lseat-plus" aria-hidden="true">+</i></span><b class="ko-lseat-name">Invite</b></li>' : '');
    // Where AROUND NOW stands: while a match this phone can watch is on, everybody still in, as the end screen's rings.
    const still = this.root.querySelector<HTMLElement>('#ko-lobby-still')!;
    still.classList.toggle('hidden', !match);
    if (match) this.root.querySelector('#ko-lobby-rings')!.innerHTML = match.rings.map(ring => `
      <button type="button" class="ko-ring${ring.out ? ' is-out' : ''}" role="listitem" data-ring="${ring.id}" aria-label="Watch ${esc(ring.name)}">
        <span class="ko-ring-face"><img src="${avatarSrc(ring.face)}" alt="" decoding="async"></span><span class="ko-ring-out">OUT</span><b>${esc(ring.name)}</b></button>`).join('');
    const last = this.root.querySelector<HTMLElement>('#ko-lobby-last')!;
    last.classList.toggle('hidden', !view.last || live);
    if (view.last) {
      last.querySelector<HTMLImageElement>('#ko-last-face')!.src = avatarSrc(view.last.face);
      last.querySelector('#ko-last-title')!.textContent = view.last.title;
      last.querySelector('#ko-last-line')!.textContent = view.last.line;
    }
    // Under the people, one thing at a time: who is around to ask in; or, with a match on that this phone can watch,
    // everybody still in it (the code steps aside too: nobody new bats a match already on); or the match that just ended.
    // All of them at once ran the room past the foot of a phone. Nobody around, and the line is left out: INVITE is at the thumb.
    const around = view.around.filter(p => !view.seats.some(s => s.handle === p.handle));
    this.root.querySelector<HTMLElement>('.ko-coderow')!.classList.toggle('hidden', !!match);
    this.root.querySelector<HTMLElement>('#ko-lobby-aroundwrap')!.classList.toggle('hidden', !!match || (!!view.last && !live) || !around.length);
    this.root.querySelector('#ko-lobby-around')!.innerHTML = around.slice(0, 12).map(p => `
      <li><button class="ko-chip${p.sent ? ' is-sent' : ''}" type="button" data-invite="${p.handle}" ${p.sent ? 'disabled' : ''} aria-label="${p.sent ? 'Invited' : 'Invite'} ${esc(p.name)}">
        <span class="ko-chip-face">${face(p.avatar)}<em class="ko-dot ${p.batting ? 'is-batting' : ''}"></em></span><b>${esc(p.name)}</b><i aria-hidden="true">${p.sent ? '✓' : '+'}</i></button></li>`).join('');
    const start = this.root.querySelector<HTMLButtonElement>('#ko-lobby-start')!, readyKey = this.root.querySelector<HTMLButtonElement>('#ko-lobby-ready')!;
    const watch = this.root.querySelector<HTMLButtonElement>('#ko-lobby-watch')!;
    start.classList.toggle('hidden', !view.hosting || !!match);
    readyKey.classList.toggle('hidden', view.hosting || !!match);
    watch.classList.toggle('hidden', !match);
    watch.disabled = !match || !match.rings.some(ring => !ring.out);
    // Everybody, or nobody: START NOW sleeps until every friend in the room is ready, and there is at least one.
    start.disabled = !everybody;
    start.classList.toggle('is-go', everybody);
    readyKey.disabled = live;
    readyKey.classList.toggle('is-ready', view.ready && !live);
    readyKey.classList.toggle('is-go', !view.ready && !live);
    readyKey.querySelector('.k-cta-face>span')!.textContent = live ? 'MATCH ON' : view.ready ? 'READY ✓' : 'I’M READY';
    // The last tick wakes START NOW: the host's phone says so in the hand.
    if (everybody && !this.allReady && view.hosting) buzz(30);
    this.allReady = everybody;
    this.status();
  }
  /** The three seconds every phone counts together (3B), or put away. */
  walkOut(n: number | null) {
    const panel = this.root.querySelector<HTMLElement>('#ko-walkout')!;
    panel.classList.toggle('hidden', n === null);
    if (n !== null) {
      this.sheet(null);
      const figure = this.root.querySelector<HTMLElement>('#ko-walkout-n')!;
      if (figure.textContent !== String(n)) { figure.textContent = String(n); figure.classList.remove('is-tick'); requestAnimationFrame(() => figure.classList.add('is-tick')); }
    }
  }
}
