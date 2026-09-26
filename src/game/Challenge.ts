import { GAME } from '../config/gameplay';
import { decodeInnings, encodeInnings, ended, figuresOf, type Ball } from './ball-string';
import {
  POLL_MS, challengeLink, clearUnsent, codeFromLocation, copy, createRoom, fetchChallenge, fetchMine,
  hiddenChallenges, holdUnsent, joinRoom, markSeenHere, readUnsent, recordResult, rivalryWith, seenHere,
  sendBalls, sendSeen, whatsapp,
  type Challenge, type ChallengeResult, type ChallengeRow, type RivalryEntry,
} from './challenge-api';

/**
 * The match room, as the game plays it.
 *
 * Everything about *rules* lives on the server and everything about *screens*
 * lives in the HUD; this is the bit in between — which room is open, whose
 * innings is the ghost, what the room screen should say to this particular
 * person, and what the reveal should say. It is kept out of `Game.ts` because
 * the innings does not change at all: the same thirty balls, the same bowler,
 * the same resolver. A match only changes who the score is measured against,
 * what flashes up in the gaps, and where each ball is written down.
 */

/** Who the game is playing as, as far as a room is concerned. */
export interface Me { playerId: string; name: string; avatar: number }

/**
 * What the room screen shows this person, worked out from the room and who is
 * looking. The same room reads differently to the host, the friend, and a
 * third person from the group chat, and it is this and not the HUD that knows
 * which.
 */
export type RoomKind =
  /** Nobody has batted. Whether the link has been sent is the browser's own note. */
  | 'lobby'
  /** Somebody else has finished or is batting, and this person has not started. */
  | 'chase'
  /** This person's innings is under way in another tab, or was, and can be picked up. */
  | 'resume'
  /** This person is done; nobody else has started. */
  | 'waiting'
  /** This person is done; somebody else is batting right now. */
  | 'spectate'
  /** Two innings are settled and this person's is one of them. */
  | 'result'
  /** The week ran out before a second innings. */
  | 'expired'
  /** Made under an older scoring. Nothing to decide. */
  | 'void'
  /** This person is not in the room and never batted; the room is over. */
  | 'spectator';

export interface RoomView {
  code: string;
  link: string;
  kind: RoomKind;
  state: Challenge['state'];
  /** Everybody, in the room's order. */
  players: ChallengeRow[];
  mine: ChallengeRow | null;
  /** Whether totals are shown. Hidden from anybody who has yet to bat. */
  blind: boolean;
  /** Time left in the words a screen uses, or how it ended. */
  closes: string;
  /** How many have opened the link, this person included. */
  size: number;
  /** The result, when there is one to read. */
  result: ResultView | null;
  /** The person still batting, when this one has finished. */
  live: { row: ChallengeRow; needs: string } | null;
}

/** What the reveal says, and to whom. */
export interface ResultView {
  code: string;
  outcome: 'W' | 'L' | 'D';
  /** Whether the match was decided by somebody walking out. */
  forfeit: boolean;
  tag: string;
  title: string;
  sub: string;
  /** Settled innings, best first. */
  players: ChallengeRow[];
  you: string;
  them: ChallengeRow | null;
  whatsapp: string;
  tell: string;
}

/** The tally against one person. */
export interface RivalryView {
  them: { playerId: string; name: string; avatar: number };
  wins: number;
  losses: number;
  draws: number;
  /** Newest first, at most five. */
  form: ('W' | 'L' | 'D')[];
  bestMine: number;
  bestTheirs: number;
  sixesMine: number;
  sixesTheirs: number;
  tally: string;
}

export class ChallengeRun {
  /** The room this browser has open, if any. */
  room: Challenge | null = null;
  /** Whether the innings being played is for this room. */
  playing = false;
  /** Whose innings flashes up between balls. Picked when the innings starts. */
  private ghostId: string | null = null;
  private timer = 0;
  private onUpdate: ((room: Challenge) => void) | null = null;
  /** Whether the link has gone out from this browser. Changes which key is primary. */
  sent = false;

  get code(): string | null { return this.room?.code ?? null; }

  /** The code this page was opened with, if any, and the room behind it. */
  async fromLink(): Promise<ChallengeResult | null> {
    const code = codeFromLocation();
    if (!code) return null;
    return this.open(code);
  }

  /** A room, fetched and held. */
  async open(code: string): Promise<ChallengeResult> {
    const answer = await fetchChallenge(code);
    if (answer.ok && answer.challenge) this.take(answer.challenge);
    return answer;
  }

  /** A room, made — empty, or from an innings that has just ended. */
  async create(me: Me, extra: { card?: string; rematchOf?: string } = {}): Promise<ChallengeResult> {
    const answer = await createRoom(me.playerId, me.name, me.avatar, extra);
    if (answer.ok && answer.challenge) { this.take(answer.challenge); this.sent = false; }
    return answer;
  }

  /** The link opened by somebody who is not yet in the room. */
  async join(me: Me): Promise<ChallengeResult> {
    const code = this.code;
    if (!code) return { ok: false, reason: 'There is no match to join.' };
    const answer = await joinRoom(code, me.playerId, me.name, me.avatar);
    if (answer.ok && answer.challenge) this.take(answer.challenge);
    return answer;
  }

  /** Whether this person is in the room at all. */
  isIn(playerId: string): boolean { return !!this.row(playerId); }

  row(playerId: string): ChallengeRow | null {
    return this.room?.players.find(one => one.playerId === playerId) ?? null;
  }

  /** Lets go of the room. */
  clear() { this.stopWatching(); this.room = null; this.playing = false; this.ghostId = null; this.sent = false; }

  private take(room: Challenge) {
    this.room = room;
    this.onUpdate?.(room);
  }

  /* ── Watching ────────────────────────────────────────────────────────── */

  /**
   * Polls the room while somebody is looking at it, or batting in it against
   * somebody who is batting too. Two seconds is a ball. A hidden tab stops
   * asking, and a room that nothing can change any more is not asked about.
   */
  watch(onUpdate: (room: Challenge) => void) {
    this.onUpdate = onUpdate;
    this.stopTimer();
    const tick = async () => {
      if (!this.room || document.hidden) return;
      if (!this.alive()) { this.stopTimer(); return; }
      const answer = await fetchChallenge(this.room.code);
      if (answer.ok && answer.challenge && this.room && answer.challenge.code === this.room.code) this.take(answer.challenge);
    };
    this.timer = window.setInterval(() => { void tick(); }, POLL_MS);
  }

  stopWatching() { this.stopTimer(); this.onUpdate = null; }
  private stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = 0; } }

  /** Whether another read could say something new. */
  private alive(): boolean {
    const room = this.room;
    if (!room) return false;
    if (room.state === 'void') return false;
    if (room.state === 'expired') return false;
    return true;
  }

  /* ── Batting ─────────────────────────────────────────────────────────── */

  /**
   * The innings begins. The ghost is whoever is furthest along among the
   * others — the finished innings in a two-player room, the leader in a group
   * — and their card is read live, so a friend batting at the same time
   * arrives ball by ball.
   */
  beginInnings(me: string) {
    this.playing = true;
    const others = (this.room?.players ?? []).filter(row => row.playerId !== me && row.card);
    others.sort((a, b) => b.card.length - a.card.length || a.joined - b.joined);
    this.ghostId = others[0]?.playerId ?? null;
  }

  /** Who the ghost is, for the flash. */
  get ghost(): ChallengeRow | null {
    return this.ghostId ? this.row(this.ghostId) : null;
  }

  /**
   * The ghost's ball at this point of the innings, or null.
   *
   * Null inside a finished ghost innings cannot happen; null past its end means
   * they were all out — see `ghostEndedAt`. Null against a ghost who is still
   * batting means they have not got this far yet, and the gap stays empty:
   * nothing on the batting screen ever says how far along anybody is.
   */
  ghostBall(index: number): Ball | null {
    const card = this.ghost?.card ?? '';
    return decodeInnings(card)[index] ?? null;
  }

  /** Which ball the ghost was out on, or null if they batted the full thirty or are still going. */
  get ghostEndedAt(): number | null {
    const row = this.ghost;
    if (!row || row.status !== 'done') return null;
    return row.card.length < GAME.totalBalls ? row.card.length : null;
  }

  /**
   * A ball, written down. The whole innings so far goes every time, so the one
   * that does not arrive is carried by the next. The last ball of an innings is
   * the one that must land, and `finishInnings` sees to that.
   */
  async ballPlayed(me: Me, history: readonly Ball[]): Promise<ChallengeResult> {
    const code = this.code;
    if (!code) return { ok: false, reason: 'No match.' };
    const card = encodeInnings(history);
    holdUnsent({ code, card, name: me.name, avatar: me.avatar, at: Date.now() });
    const answer = await sendBalls(code, me.playerId, me.name, me.avatar, card);
    if (answer.ok && answer.challenge) {
      clearUnsent();
      this.take(answer.challenge);
    }
    return answer;
  }

  /**
   * The innings is over; the last card has to get through. Tried a few times
   * with a breath between, because the reveal is what the player has waited
   * five overs for and a dead spot should cost seconds, not the result.
   */
  async finishInnings(me: Me, history: readonly Ball[]): Promise<ChallengeResult> {
    let answer = await this.ballPlayed(me, history);
    for (let attempt = 0; !answer.ok && answer.retry && attempt < 3; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1200 * (attempt + 1)));
      answer = await this.ballPlayed(me, history);
    }
    this.playing = false;
    return answer;
  }

  /** The balls this person already has in this room, to pick up from. */
  resumeFrom(me: string): Ball[] {
    const row = this.row(me);
    if (!row || row.status !== 'batting') return [];
    return decodeInnings(row.card);
  }

  /** An innings held from a failed send, retried on the next open. */
  static async retryUnsent(playerId: string) {
    const held = readUnsent();
    if (!held) return null;
    const answer = await sendBalls(held.code, playerId, held.name, held.avatar, held.card);
    if (answer.ok || (answer.status && answer.status < 500 && !answer.retry)) clearUnsent();
    return answer.ok ? answer : null;
  }

  /* ── Reading the room ────────────────────────────────────────────────── */

  /** The room as this person should see it. */
  view(me: string, now = Date.now()): RoomView | null {
    const room = this.room;
    if (!room) return null;
    return roomView(room, me, this.sent, now);
  }

  /** The result marked as seen, here and on the server. */
  async seen(me: Me) {
    const code = this.code;
    if (!code) return;
    markSeenHere(code);
    await sendSeen(code, me.playerId, me.name, me.avatar);
  }

  /**
   * Every room this person is in, sorted into what it needs from them.
   *
   * One call. The unseen results come out separately, because they are shown
   * before anything else on open — there is no web push worth having, so this
   * is how somebody finds out they were beaten on Thursday.
   */
  static async mine(me: string): Promise<ListView | null> {
    const answer = await fetchMine(me);
    if (!answer.ok || !answer.challenges) return null;
    return sortList(answer.challenges, me);
  }
}

/** The list, in the order it matters. */
export interface ListView {
  yourMove: Challenge[];
  waitingOnThem: Challenge[];
  done: Challenge[];
  /** Results this person has not been shown. Oldest first, so they stack in order. */
  unseen: Challenge[];
}

export function sortList(rooms: readonly Challenge[], me: string, now = Date.now()): ListView {
  const hidden = new Set(hiddenChallenges());
  const list: ListView = { yourMove: [], waitingOnThem: [], done: [], unseen: [] };
  for (const room of rooms) {
    const view = roomView(room, me, false, now);
    const settled = view.mine && (view.mine.status === 'done' || view.mine.status === 'forfeit');
    if (view.result && view.mine && !view.mine.seen && !seenHere(room.code)) list.unseen.push(room);
    if (hidden.has(room.code)) continue;
    if (view.kind === 'chase' || view.kind === 'resume' || (view.kind === 'lobby' && !settled)) list.yourMove.push(room);
    else if (view.kind === 'waiting' || view.kind === 'spectate') list.waitingOnThem.push(room);
    else list.done.push(room);
  }
  list.unseen.sort((a, b) => a.at - b.at);
  return list;
}

/**
 * The room, read for one person.
 *
 * The one rule worth stating: totals are hidden from anybody who has not
 * batted yet. That is the whole mode — a friend who opens the link on
 * Thursday sees that you batted, not what you made, and finds out on their
 * thirtieth ball. A person who has finished sees everything, which is what
 * makes watching the other innings land worth staying for.
 */
export function roomView(room: Challenge, me: string, sent: boolean, now = Date.now()): RoomView {
  void sent;
  const mine = room.players.find(row => row.playerId === me) ?? null;
  const others = room.players.filter(row => row.playerId !== me);
  const settled = (row: ChallengeRow) => row.status === 'done' || row.status === 'forfeit';
  const iAmSettled = !!mine && settled(mine);
  const othersSettled = others.filter(settled);
  const battingNow = others.find(row => row.status === 'batting') ?? null;
  const result = iAmSettled && othersSettled.length ? resultView(room, me) : null;

  let kind: RoomKind;
  if (room.state === 'void') kind = 'void';
  else if (result) kind = 'result';
  else if (!mine && (room.state === 'expired' || room.state === 'done')) kind = 'spectator';
  else if (room.state === 'expired') kind = 'expired';
  else if (mine?.status === 'batting') kind = 'resume';
  else if (iAmSettled && battingNow) kind = 'spectate';
  else if (iAmSettled) kind = 'waiting';
  else if (othersSettled.length || battingNow) kind = 'chase';
  else kind = 'lobby';

  const blind = !iAmSettled && kind !== 'spectator' && kind !== 'void';
  const live = kind === 'spectate' && battingNow && mine
    ? { row: battingNow, needs: needsLine(mine, battingNow) }
    : null;

  return {
    code: room.code,
    link: challengeLink(room.code),
    kind,
    state: room.state,
    players: room.players,
    mine,
    blind,
    closes: closesIn(room.expiresAt, now, room.state),
    size: room.players.length,
    result,
    live,
  };
}

/** What the person still batting needs, off the one who has finished. */
function needsLine(done: ChallengeRow, batting: ChallengeRow): string {
  const left = GAME.totalBalls - batting.balls;
  const need = done.runs - batting.runs + 1;
  if (batting.wickets >= GAME.maxWickets) return 'all out';
  if (need <= 0) return `already past you · ${left} ball${left === 1 ? '' : 's'} left`;
  return `needs ${need} off ${left} ball${left === 1 ? '' : 's'}`;
}

/**
 * What the reveal says.
 *
 * The strip names the manner, the headline names the result, and the line under
 * it picks whichever is the better story. Normally that is the margin. When the
 * winner was bowled out it is the manner — being three down in two overs and
 * still winning is a flex, not an apology, and the screen should say so.
 *
 * In a group the headline is against whoever came nearest — the person you beat
 * or the person who beat you — and the scoreline lists everybody who finished.
 */
export function resultView(room: Challenge, me: string): ResultView | null {
  const settled = room.players.filter(row => row.status === 'done' || row.status === 'forfeit');
  const mine = settled.find(row => row.playerId === me) ?? null;
  const others = settled.filter(row => row.playerId !== me);
  if (!mine || !others.length) return null;
  const above = others.filter(row => row.score > mine.score);
  const level = others.filter(row => row.score === mine.score);
  const below = others.filter(row => row.score < mine.score);
  // The nearest rival: the lowest of those above, else a level one, else the highest below.
  const them = above.length ? above[above.length - 1] : level[0] ?? below[0];
  const outcome: ResultView['outcome'] = above.length ? 'L' : level.length ? 'D' : 'W';
  const forfeit = mine.status === 'forfeit' || them.status === 'forfeit';

  const myRuns = mine.runs;
  const theirRuns = them.runs;
  const margin = Math.abs(myRuns - theirRuns);
  const name = them.name;
  const allOut = (row: ChallengeRow) => row.wickets >= GAME.maxWickets;
  const overs = (row: ChallengeRow) => {
    const whole = Math.floor(row.balls / GAME.ballsPerOver);
    return whole <= 1 ? `${row.balls} balls` : `${whole} overs`;
  };
  const runsWord = (n: number) => `${n} run${n === 1 ? '' : 's'}`;
  const iBattedFirst = mine.at <= them.at;

  const tag = forfeit ? 'BY FORFEIT'
    : allOut(mine) ? `ALL OUT · BALL ${mine.balls}`
      : room.rematchOf ? 'REMATCH'
        : iBattedFirst ? 'YOU SET IT' : `${name.toUpperCase()} SET IT`;
  const title = outcome === 'W' ? 'You win' : outcome === 'D' ? 'Dead heat' : `${name} wins`;

  let sub: string;
  if (forfeit && outcome === 'W') {
    sub = `${name} walked out on ball ${them.balls} and never came back. A win is a win.`;
  } else if (forfeit) {
    sub = `You left it on ball ${mine.balls}. A day passed. ${name} keeps the points.`;
  } else if (outcome === 'W' && allOut(mine)) {
    sub = `Three down inside ${overs(mine)} and still past ${name}'s ${theirRuns}. Reckless. Effective.`;
  } else if (outcome === 'W' && iBattedFirst) {
    sub = `Your ${myRuns} held. ${name} fell ${runsWord(margin)} short of it.`;
  } else if (outcome === 'W') {
    sub = `By ${runsWord(margin)}. ${name} is not going to enjoy this.`;
  } else if (outcome === 'D') {
    sub = `Level on ${myRuns}. Level on sixes. Level on fours. Nobody sits down — a rematch settles it.`;
  } else if (margin === 0) {
    sub = `Level on ${myRuns}, and ${name} had the better boundaries. You had to beat it, not match it.`;
  } else if (iBattedFirst) {
    sub = `${name} got past your ${myRuns} with ${runsWord(margin)} to spare.`;
  } else if (allOut(mine)) {
    sub = `${runsWord(margin)} short, three down inside ${overs(mine)}. Brutal, honestly.`;
  } else {
    sub = `${runsWord(margin)} short. So close it hurts.`;
  }

  return {
    code: room.code,
    outcome,
    forfeit,
    tag,
    title,
    sub,
    players: settled,
    you: me,
    them,
    whatsapp: whatsapp(copy.result(myRuns, theirRuns, name, challengeLink(room.code))),
    tell: outcome === 'W' ? 'RUB IT IN' : outcome === 'D' ? 'DEMAND A REMATCH' : 'SEND AN EXCUSE',
  };
}

/** A result, noted against the friend it was against, the first time it is seen. */
export function noteResult(view: ResultView) {
  const mine = view.players.find(row => row.playerId === view.you);
  const them = view.them;
  if (!mine || !them) return;
  recordResult({
    code: view.code,
    them: { playerId: them.playerId, name: them.name, avatar: them.avatar },
    mine: { runs: mine.runs, sixes: mine.sixes, fours: mine.fours },
    theirs: { runs: them.runs, sixes: them.sixes, fours: them.fours },
    outcome: view.outcome,
    at: Date.now(),
  });
}

/** The tally against one person, from what this browser has seen. */
export function rivalryView(playerId: string, fallback?: { name: string; avatar: number }): RivalryView | null {
  const entries: RivalryEntry[] = rivalryWith(playerId);
  const latest = entries[0];
  const them = latest ? latest.them : fallback ? { playerId, ...fallback } : null;
  if (!them) return null;
  const wins = entries.filter(one => one.outcome === 'W').length;
  const losses = entries.filter(one => one.outcome === 'L').length;
  const draws = entries.filter(one => one.outcome === 'D').length;
  const tally = wins === losses
    ? `${wins}–${losses}, all square`
    : wins > losses ? `${wins}–${losses} to you` : `${losses}–${wins} to ${them.name}`;
  return {
    them,
    wins, losses, draws,
    form: entries.slice(0, 5).map(one => one.outcome),
    bestMine: Math.max(0, ...entries.map(one => one.mine.runs)),
    bestTheirs: Math.max(0, ...entries.map(one => one.theirs.runs)),
    sixesMine: entries.reduce((sum, one) => sum + one.mine.sixes, 0),
    sixesTheirs: entries.reduce((sum, one) => sum + one.theirs.sixes, 0),
    tally,
  };
}

/** The message a rematch goes out with. */
export function rematchText(url: string, them: string, tally: string): string {
  return copy.rematch(url, them, tally);
}

/** How long a room has left, in the words a screen uses. */
export function closesIn(expiresAt: number, now = Date.now(), state?: Challenge['state']): string {
  if (state === 'done') return 'settled';
  if (state === 'void') return 'void';
  const left = expiresAt - now;
  if (left <= 0) return 'closed';
  const days = Math.floor(left / (24 * 3600_000));
  const hours = Math.floor((left % (24 * 3600_000)) / 3600_000);
  return days > 0 ? `${days}d ${hours}h left` : hours > 0 ? `${hours}h left` : 'closing soon';
}

/** The figures of a card, for anything that has a string and wants numbers. */
export function figures(card: string) {
  const got = figuresOf(card);
  return { ...got, over: ended(got) };
}
