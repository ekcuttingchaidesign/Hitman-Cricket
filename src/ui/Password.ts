/**
 * The career password, as screens (Figma section 13, "Career password · user
 * journeys"): the card that asks for one, the sheet that sets it, the question
 * picked for the day it is forgotten, and the forgot-password sheets.
 *
 * Every way in opens the one sheet: the card on My Stats, the card on the end
 * of an innings, the sheet that asks after three ignored innings, the password
 * row on Your details, and Welcome back after a career key. Its fields are a
 * username and a new password to the phone, so Safari and Chrome offer to save
 * them and the restore sheet's password field fills itself in later.
 *
 * Strings, as the rest of the interface is, so the tests read them without a
 * browser. The rules a password is held to are `passwordProblem`'s, said live
 * under the fields and again by the store.
 */

import { QUESTIONS } from '../game/password-questions';
import { passwordProblem, PASSWORD_MIN } from '../server/password-rules';
import { avatarSrc } from '../config/board';
import { escape } from './Leaderboard';
import { cta, icon } from './Kit';

/** What the sheet is doing: a first password, a change from My Stats, or a new one after a forgotten one. */
export type PasswordMode = 'set' | 'change' | 'recover';

export interface PasswordSheetView {
  mode: PasswordMode;
  name: string;
  avatar: number;
  /** The question picked, by its place on the list, or null for none. */
  question: number | null;
  /** The player already has an answer to this question (change mode), so a blank answer keeps it. */
  answerKept?: boolean;
  /** The list of questions is up in place of the form. */
  picking?: boolean;
  sending?: boolean;
  error?: string | null;
}

/** What the sheet hands the game. */
export interface PasswordEntry {
  password: string;
  confirm: string;
  question: number | null;
  answer: string;
}

const TITLE: Record<PasswordMode, string> = { set: 'SET A PASSWORD', change: 'CHANGE PASSWORD', recover: 'SET A NEW PASSWORD' };
const SAY: Record<PasswordMode, string> = {
  set: 'Your way back to this career on any phone. Your phone can offer to remember it.',
  change: 'Leave a field blank to keep it. Your phone will offer to update the one it saved.',
  recover: 'That’s right. Pick a new password, and the old one stops working.',
};
const GO: Record<PasswordMode, string> = { set: 'SAVE PASSWORD', change: 'SAVE CHANGES', recover: 'SAVE AND BRING IT BACK' };

/** The three checks under the fields, each met, not yet, or failed. */
export type RuleState = 'met' | 'wait' | 'bad';
export interface RuleStates { long: RuleState; hard: RuleState; same: RuleState }

/**
 * The checks as the player types. Quiet until there is something to judge:
 * nothing typed is "not yet", never a failure.
 */
export function ruleStates(password: string, confirm: string, name: string): RuleStates {
  const said = password.trim();
  const long: RuleState = [...said].length >= PASSWORD_MIN ? 'met' : 'wait';
  const problem = long === 'met' ? passwordProblem(said, name) : null;
  const hard: RuleState = long !== 'met' ? 'wait' : problem ? 'bad' : 'met';
  const same: RuleState = !confirm ? 'wait' : confirm.trim() === said ? 'met' : 'bad';
  return { long, hard, same };
}

/** What is wrong with the sheet as it stands, in one line, or null. */
export function entryProblem(entry: PasswordEntry, name: string, mode: PasswordMode, answerKept = false): string | null {
  const blank = !entry.password.trim() && !entry.confirm.trim();
  if (!(mode === 'change' && blank)) {
    const problem = passwordProblem(entry.password, name);
    if (problem) return problem;
    if (entry.confirm.trim() !== entry.password.trim()) return 'These don’t match. Type it again.';
  }
  if (entry.question !== null && !entry.answer.trim() && !answerKept) return 'Answer the question, or leave it out.';
  if (mode === 'change' && blank && entry.question === null) return 'Nothing to change yet.';
  return null;
}

const ruleMarkup = (s: RuleStates) => `
          <ul id="pw-rules" class="pw-rules" aria-live="polite">${([['long', `${PASSWORD_MIN}+ characters`], ['hard', 'Not too easy'], ['same', 'Both match']] as const)
    .map(([k, words]) => `<li class="is-${s[k]}" data-rule="${k}"><i aria-hidden="true">${s[k] === 'bad' ? icon('alert') : icon('check')}</i>${words}</li>`).join('')}</ul>`;

const who = (name: string, avatar: number, line = 'BATTING AS', mark = '') => `
          <div class="pw-who">
            <img src="${avatarSrc(avatar)}" alt="" draggable="false">
            <span><small>${escape(line)}</small><b>${escape(name)}</b></span>${mark}
          </div>`;

const head = (id: string, title: string, mark: Parameters<typeof icon>[0], close = true) => `
          <div class="ks-head">
            <span class="ks-mark" aria-hidden="true">${icon(mark)}</span>
            <h2 id="${id}" class="ks-title">${escape(title)}</h2>
            ${close ? `<button class="ks-close pw-close" type="button" aria-label="Close">${icon('close')}</button>` : ''}
          </div>`;

const sheet = (labelled: string, body: string, extra = '') => `
    <div class="key-modal pw-modal" role="dialog" aria-modal="true" aria-labelledby="${labelled}">
      <div class="key-sheet ks-sheet pw-sheet${extra}">
        <i class="ks-grab" aria-hidden="true"></i>${body}
      </div>
    </div>`;

const field = (id: string, label: string, input: string, side = '') => `
          <div class="rs-field pw-field">
            <div class="rs-field-head"><label for="${id}">${escape(label)}</label>${side}</div>
            ${input}
          </div>`;

/** The sheet that sets or changes a password, or the list of questions over it. */
export function passwordSheetMarkup(view: PasswordSheetView): string {
  if (view.picking) return questionsMarkup(view.question);
  const { mode, name, avatar, question, answerKept = false, sending = false, error = null } = view;
  const secret = (id: string, placeholder: string, auto: string) => `<span class="pw-secret">
              <input id="${id}" type="password" autocomplete="${auto}" autocapitalize="none" autocorrect="off" spellcheck="false"
                maxlength="64" placeholder="${escape(placeholder)}">
              <button class="pw-show" type="button" data-for="${id}" aria-pressed="false">SHOW</button></span>`;
  const blank = mode === 'change';
  const asks = mode !== 'recover';
  const body = `
        <form id="pw-form" class="rs-form pw-form" data-mode="${mode}" novalidate>${head('pw-title', TITLE[mode], 'lock')}
          <p class="ks-say">${SAY[mode]}</p>
          <input class="pw-user" type="text" name="username" autocomplete="username" value="${escape(name)}" tabindex="-1" aria-hidden="true" readonly>${who(name, avatar)}
          ${field('pw-new', mode === 'set' ? 'Password' : 'New password', secret('pw-new', blank ? 'Leave blank to keep yours' : `At least ${PASSWORD_MIN} characters`, 'new-password'))}
          ${field('pw-confirm', 'Confirm password', secret('pw-confirm', 'Type it again', 'new-password'))}
          ${ruleMarkup(ruleStates('', '', name))}
          ${asks ? `
          <div class="rs-field pw-field">
            <div class="rs-field-head"><span class="pw-label">Security question <i class="pw-tag">OPTIONAL</i></span></div>
            <button id="pw-question" class="pw-pick${question === null ? ' is-empty' : ''}" type="button">
              <span>${escape(question === null ? 'Pick a question' : QUESTIONS[question])}</span>${icon('chevron-down')}</button>
          </div>
          ${question === null ? '' : field('pw-answer', 'Your answer', `<input id="pw-answer" type="text" autocomplete="off" maxlength="60"
              placeholder="${escape(answerKept ? 'Leave blank to keep your answer' : 'Only you would know it')}">`)}
          ${question === null ? '' : '<p class="pw-fine">Capitals and spaces don’t matter. Nobody else ever sees it.</p>'}` : ''}
          ${error ? `<p id="pw-error" class="rs-error" role="alert">${escape(error)}</p>` : ''}
          <button id="pw-send" type="submit" class="k-cta k-cta--primary is-wide"${sending ? ' disabled' : ''}><span class="k-cta-face"><span>${sending ? 'SAVING…' : GO[mode]}</span></span></button>
        </form>`;
  return sheet('pw-title', body);
}

/** Pick a question: the eight, the picked one ringed, and the way back to the form. */
export function questionsMarkup(picked: number | null): string {
  const rows = QUESTIONS.map((q, i) => `
            <button class="pw-option${i === picked ? ' is-on' : ''}" type="button" role="radio" aria-checked="${i === picked}" data-q="${i}">
              <span>${escape(q)}</span><i aria-hidden="true">${i === picked ? icon('check') : ''}</i></button>`).join('');
  const body = `${head('pw-q-title', 'PICK A QUESTION', 'question', false)}
        <p class="ks-say">For the day you forget your password. Pick one you would answer the same way in a year.</p>
        <div class="pw-options" role="radiogroup" aria-labelledby="pw-q-title">${rows}
        </div>
        ${cta({ kind: 'primary', label: 'USE THIS QUESTION', id: 'pw-q-use', wide: true, disabled: picked === null })}
        <button id="pw-q-none" class="rs-switch" type="button">No question for now</button>`;
  return sheet('pw-q-title', body, ' is-tall');
}

/** Set: the career is protected, and how to use it on a phone that forgot. */
export function passwordDoneMarkup(name: string, avatar: number, changed = false): string {
  const body = `${head('pw-done-title', changed ? 'PASSWORD CHANGED' : 'CAREER PROTECTED', 'shield', false)}
        <p class="ks-say is-lead">${changed ? 'Use the new one from now on. The old one no longer opens this career.' : 'Lost this phone, or cleared the browser? Tap Played before? on the name screen, pick yourself and type your password.'}</p>
        ${who(name, avatar, 'PROTECTED', `<i class="pw-tick" aria-hidden="true">${icon('check')}</i>`)}
        ${cta({ kind: 'primary', label: 'GOT IT', id: 'pw-done', wide: true })}`;
  return sheet('pw-done-title', body, ' is-done');
}

export interface NudgeFigures {
  runs: number;
  innings: number;
  /** The best place on any board, where there is one. */
  rank: number | null;
}

/** The sheet that asks outright, after three end cards walked past. */
export function nudgeSheetMarkup(f: NudgeFigures): string {
  const runs = f.runs.toLocaleString('en-US');
  const tile = (n: string, words: string) => `<span class="pw-tile"><b>${escape(n)}</b><small>${escape(words)}</small></span>`;
  const body = `${head('pw-nudge-title', `DON’T LOSE ${runs} RUNS`, 'shield')}
        <p class="ks-say is-lead">Phones forget, and browsers get cleared. A password brings your whole career back on any phone, in seconds.</p>
        <div class="pw-tiles">${tile(runs, 'Career runs')}${tile(String(f.innings), 'Innings')}${tile(f.rank ? `#${f.rank}` : '—', 'Best rank')}</div>
        ${cta({ kind: 'primary', label: 'SET A PASSWORD', id: 'pw-nudge-set', wide: true })}
        <button id="pw-nudge-later" class="rs-switch is-quiet" type="button">Not now</button>`;
  return sheet('pw-nudge-title', body);
}

export interface PasswordCardView {
  place: 'stats' | 'end';
  /** Career runs, every mode added up. */
  runs: number;
  /** A new best this innings, to say so. */
  best?: number | null;
  /** The first of the rail's cards carries the id; the others the same key by class. */
  first?: boolean;
}

/**
 * The card that asks: on My Stats above Road to Hitman, and on the end of an
 * innings where the career key used to be. An orange glow, a shield, a title
 * that names what is at stake, and the key that opens the sheet — on the end
 * card solid orange, so it is never mistaken for PLAY AGAIN.
 */
export function passwordCardMarkup(view: PasswordCardView): string {
  const runs = view.runs.toLocaleString('en-US');
  const end = view.place === 'end';
  const over = end && view.best ? 'NEW BEST · NOT PROTECTED' : 'NOT PROTECTED';
  const title = end
    ? (view.best ? `YOUR BEST EVER, ${view.best}. PROTECT IT.` : `${runs} RUNS. DON’T LOSE THEM.`)
    : (view.runs > 0 ? `PROTECT YOUR ${runs} RUNS` : 'KEEP THIS CAREER SAFE');
  const sub = end ? '' : (view.runs > 0
    ? 'Phones forget and browsers get cleared. A password brings every run back on any phone.'
    : 'A password brings this career back on any phone, even a new one. It takes ten seconds.');
  const id = end ? 'card-password-go' : view.first ? 'stats-password' : undefined;
  const key = end
    ? cta({ kind: 'solid', label: 'CREATE A PASSWORD', id, icon: 'lock' })
    : cta({ kind: 'primary', label: 'SET A PASSWORD', id, wide: true });
  return `
        <section class="pw-card is-${view.place}" aria-label="Set a password">
          <div class="pw-card-head">
            <span class="pw-card-mark" aria-hidden="true">${icon('shield')}</span>
            <span class="pw-card-say"><small>${over}</small><b>${escape(title)}</b></span>
          </div>
          ${sub ? `<p class="pw-card-sub">${escape(sub)}</p>` : ''}
          ${key.replace('class="k-cta', 'class="pw-card-go k-cta')}
        </section>`;
}

/** Forgot password, with a question: the question, and the answer to it. */
export function answerSheetMarkup(view: { name: string; avatar: number; question: number; sending?: boolean; error?: string | null }): string {
  const body = `
        <form id="rq-form" class="rs-form" novalidate>${head('rq-title', 'ANSWER YOUR QUESTION', 'question')}
          <p class="ks-say">You picked this when you set your password. Answer it, then choose a new password.</p>${who(view.name, view.avatar, 'BRINGING BACK')}
          <div class="pw-question"><small>YOUR QUESTION</small><b>${escape(QUESTIONS[view.question])}</b></div>
          ${field('rq-answer', 'Your answer', `<input id="rq-answer" type="text" autocomplete="off" maxlength="60" placeholder="Capitals and spaces don’t matter"${view.error ? ' aria-invalid="true"' : ''}>`)}
          ${view.error ? `<p id="rq-error" class="rs-error" role="alert">${escape(view.error)}</p>` : ''}
          <button id="rq-send" type="submit" class="k-cta k-cta--primary is-wide"${view.sending ? ' disabled' : ''}><span class="k-cta-face"><span>${view.sending ? 'CHECKING…' : 'CHECK ANSWER'}</span></span></button>
          <button id="rq-key" class="rs-switch is-quiet" type="button">No luck? Use your career key</button>
        </form>`;
  return sheet('rq-title', body);
}

/** Forgot password, with no question: the career key, and what happens with no key either. */
export function noQuestionMarkup(): string {
  const body = `${head('rq-none-title', 'FORGOT YOUR PASSWORD?', 'question')}
        <p class="ks-say">You didn’t pick a security question, so your career key is the way back.</p>
        <button id="rq-use-key" class="pw-way" type="button">
          <span class="pw-way-mark" aria-hidden="true">${icon('key')}</span>
          <span class="pw-way-say"><b>Use your career key</b><small>The three words and two numbers on your My Stats page.</small></span>${icon('chevron-right')}
        </button>
        <div class="pw-nokey"><small>NO KEY EITHER?</small><p>There’s no way back to this career in the game. Your old name stays held, so pick a new one to start again.</p></div>
        <button id="rq-back" class="rs-switch is-quiet" type="button">Back</button>`;
  return sheet('rq-none-title', body);
}

/** Whether this page is inside another app's own browser, where the phone's saved passwords are out of reach. */
export function insideAnApp(agent: string): boolean {
  return /Instagram|FBAN|FBAV|FB_IAB|Snapchat|Line\/|LinkedInApp|Twitter/i.test(agent);
}
