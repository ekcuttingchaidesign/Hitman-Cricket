import { track } from '../game/analytics';
import { sendFeedback } from '../game/feedback-api';
import {
  PLAYED, SUGGESTION_MAX, askOf, feedbackGiven, followUpFor, markFeedbackGiven, playedFrom, questionsFor,
  type FeedbackAnswers, type FeedbackContext, type Question,
} from '../game/feedback';
import type { Rating } from '../game/rating';
import { gameLink } from '../game/Share';
import { cta } from './Kit';

const TITLE = new URL('../assets/title.webp', import.meta.url).href;
/** The cross on the close key (Figma 133:12750). */
const CROSS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 4 4 12M4 4l8 8"/></svg>';
/** The tick in a chosen answer's mark (Figma 133:12767). */
const TICK = '<svg viewBox="0 0 22 22" fill="none" stroke="#0b0f14" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 10 9.5 14 16.5 6"/></svg>';
/** The thank-you's tick in its green disc (Figma 133:12946). */
const DONE_TICK = '<svg class="feedback-tick" viewBox="0 0 64 64" fill="none" aria-hidden="true"><rect width="64" height="64" rx="32" fill="#5BD08F" fill-opacity=".16"/><path d="M21 32 29 40 43 24" stroke="#5BD08F" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/** The shared link's masthead (Figma 133:12691): the logo, and what the form costs. */
const MASTHEAD = `<div class="feedback-masthead"><img src="${TITLE}" alt="Hitman Cricket"><p>Two minutes, ten taps. It shapes what gets built next.</p></div>`;

/**
 * The questionnaire, as a screen.
 *
 * One question at a time on a card at the foot (Figma 133:12730 and on), with
 * the answers as rows big enough to hit without looking, each with its mark. Tapping one is the whole interaction: a single-answer
 * question records the tap and moves on by itself, so ten questions are ten taps
 * and there is no Next key to find between them. The one question that takes two
 * answers is the exception and says so, and it is the only screen with a key of
 * its own.
 *
 * The reason for one-at-a-time rather than a scrolling sheet is what a scrolling
 * sheet looks like on a phone: a wall of questions, a thumb on the scrollbar, and
 * a decision about whether to start at all. A question that fills the screen is
 * a question that gets answered, and the pips along the top are what promise it
 * will be over shortly.
 *
 * Nothing is sent until the last screen. What is tapped is held in
 * `sessionStorage` on the way, so a mis-hit on the back gesture costs nobody
 * their answers — and a form left half-done is left, not sent: an opinion
 * somebody stopped giving halfway through is not an opinion they gave.
 */

/** Where a half-finished form is kept while the tab is open. */
const DRAFT_KEY = 'hitman-feedback-draft';

/** The last screen, which is the only one with a keyboard on it. */
const SUGGESTION = '__suggestion';

export interface FeedbackOptions {
  /** What the sheet is mounted into: the stage in-game, the page on the link. */
  root: HTMLElement;
  context: FeedbackContext;
  /** The shared link, which has a gate at the front and a way into the game at the end. */
  standalone?: boolean;
  playerId?: string | null;
  /**
   * The stars just given, where this is the "tell us more" after a rating rather
   * than the questionnaire. It asks the handful of questions that rating calls
   * for and sends them with the stars, under the rating's own ref.
   */
  followUp?: Rating;
  /** `?rate=1`'s follow-up: the same screens, and the answers go nowhere. */
  preview?: boolean;
  /** Called when the sheet is gone, whether it was sent or waved away. */
  onDone?: (given: boolean) => void;
}

interface Draft {
  answers: FeedbackAnswers;
  suggestion: string;
}

export function openFeedback(options: FeedbackOptions) {
  const standalone = !!options.standalone;
  const followUp = options.followUp ?? null;
  const touch = document.documentElement.classList.contains('touch-device');
  // The follow-up keeps no draft: it is four taps long, and sharing the
  // questionnaire's would put its half-finished answers on the wrong form.
  const draft = followUp ? { answers: {}, suggestion: '' } : readDraft();
  const answers: FeedbackAnswers = draft.answers;
  let suggestion = draft.suggestion;
  let step = 0;
  let sending = false;

  track(followUp ? 'rating-more-open' : standalone ? 'feedback-open-link' : 'feedback-open', 'Feedback form opened');
  const eyebrow = followUp ? 'TELL US MORE' : 'WHAT DID YOU THINK?';
  const keep = (held: Draft) => { if (!followUp) saveDraft(held); };

  const gate = document.createElement('div');
  gate.className = `modal-overlay feedback-screen${standalone ? ' is-standalone' : ''}`;
  gate.setAttribute('role', 'dialog');
  gate.setAttribute('aria-modal', 'true');
  gate.setAttribute('aria-label', 'What did you think?');
  options.root.appendChild(gate);
  document.addEventListener('keydown', onKey);

  /**
   * The questions as they stand. Recomputed rather than fixed, because on the
   * shared link the first answer decides the rest: somebody who has never batted
   * is not asked which shot felt best.
   */
  const questions = () => followUp ? followUpFor(followUp.thing, followUp.stars) : questionsFor({
    standalone,
    played: standalone ? (answers[PLAYED] ? playedFrom(answers[PLAYED][0]) : null) : true,
    touch,
  });

  /** Every screen, the words box included. */
  const steps = () => [...questions().map(question => question.id), SUGGESTION];

  draw();

  function draw() {
    const all = steps();
    const id = all[Math.min(step, all.length - 1)];
    const question = questions().find(one => one.id === id) ?? null;
    // The gate is asked before the form knows its own length, so the pips would
    // be a promise it cannot keep. They arrive with the second screen.
    const counted = !(standalone && step === 0);
    const picked = question ? answers[question.id] ?? [] : [];
    gate.innerHTML = `${standalone ? MASTHEAD : ''}
      <div class="feedback-sheet">
        <div class="feedback-top">
          <div class="feedback-meta">
            <p class="feedback-eyebrow-row"><span class="feedback-eyebrow">${eyebrow}</span>${counted ? `<span class="feedback-of">${step + 1} / ${all.length}</span>` : ''}</p>
            ${counted ? pipsMarkup(all.length, step) : ''}
          </div>
          <button id="feedback-close" class="feedback-close" type="button" aria-label="Close">${CROSS}</button>
        </div>
        ${question ? questionMarkup(question, touch, picked) : suggestionMarkup(suggestion)}
        ${actionsMarkup(question, picked, step)}
      </div>`;
    wire(question);
  }

  function wire(question: Question | null) {
    find('feedback-close').onclick = () => close(false);
    const back = document.getElementById('feedback-back');
    if (back) back.onclick = () => { step = Math.max(0, step - 1); draw(); };

    if (!question) return wireSuggestion();

    const multi = (question.pick ?? 1) > 1;
    gate.querySelectorAll<HTMLButtonElement>('.feedback-choice').forEach(key => {
      key.onclick = () => {
        const id = key.dataset.choice!;
        answers[question.id] = multi ? toggled(answers[question.id] ?? [], id, question.pick ?? 1) : [id];
        // The gate decides which questions follow, so an answer changed after
        // the fact must not leave answers to questions nobody is being asked.
        if (question.id === PLAYED) prune();
        keep({ answers, suggestion });
        if (multi) return draw();
        // A beat, so the key is seen to go down before the screen it is on
        // leaves. Without it the tap reads as the screen having jumped.
        key.classList.add('is-on');
        window.setTimeout(advance, 130);
      };
    });
    const next = document.getElementById('feedback-next');
    if (next) next.onclick = advance;
    // The first key, so a keyboard walks the answers rather than the furniture —
    // and only on a keyboard. A focus ring drawn around the first answer on a
    // phone reads as that answer already being chosen, which is a lie about a
    // question nobody has answered yet.
    if (!touch) gate.querySelector<HTMLButtonElement>('.feedback-choice')?.focus();
  }

  function wireSuggestion() {
    const box = gate.querySelector<HTMLTextAreaElement>('#feedback-words')!;
    box.value = suggestion;
    box.oninput = () => {
      suggestion = box.value.slice(0, SUGGESTION_MAX);
      find('feedback-left').textContent = `${SUGGESTION_MAX - suggestion.length}`;
      keep({ answers, suggestion });
    };
    find('feedback-send').onclick = () => { void send(); };
    const skip = document.getElementById('feedback-skip');
    if (skip) skip.onclick = () => { void send(); };
  }

  function advance() {
    const all = steps();
    step = Math.min(all.length - 1, step + 1);
    draw();
  }

  /** Answers to questions the branch has taken away. */
  function prune() {
    const asked = new Set(questions().map(question => question.id));
    for (const id of Object.keys(answers)) if (!asked.has(id)) delete answers[id];
  }

  async function send() {
    if (sending) return;
    sending = true;
    const key = find('feedback-send') as HTMLButtonElement;
    key.disabled = true;
    labelled(key, 'SENDING…');
    const sent = options.preview ? { ok: true as const, reason: undefined } : await sendFeedback({
      playerId: options.playerId ?? null,
      answers,
      suggestion,
      context: { ...options.context, link: standalone || undefined },
      rating: followUp,
    });
    sending = false;
    if (!sent.ok) {
      key.disabled = false;
      labelled(key, 'TRY AGAIN');
      find('feedback-error').textContent = `${sent.reason} Nothing you typed has been lost.`;
      find('feedback-error').classList.remove('hidden');
      track('feedback-failed', 'Feedback could not be sent');
      return;
    }
    if (options.preview) return thanks();
    track(followUp ? 'rating-more-sent' : 'feedback-sent', 'Feedback sent');
    // The follow-up is not the questionnaire, so the quiet lines into that stay.
    if (!followUp) { markFeedbackGiven(); clearDraft(); }
    thanks();
  }

  /**
   * The last screen. On the shared link it is also the first time the game is
   * offered: somebody who has just spent a minute answering questions about it
   * should not have to go and find it.
   */
  function thanks() {
    gate.innerHTML = `${standalone ? MASTHEAD : ''}
      <div class="feedback-sheet feedback-thanks">
        ${options.preview ? '<span class="feedback-eyebrow">PREVIEW — NOTHING WAS SENT</span>' : ''}
        ${DONE_TICK}
        <h2>Thank you</h2>
        <p>That is genuinely useful. Every answer is read.</p>
        ${standalone
          ? `<a class="k-cta k-cta--primary is-wide" href="${gameLink()}"><span class="k-cta-face"><span>PLAY HITMAN CRICKET</span></span></a>`
          : cta({ kind: 'primary', label: 'BACK TO THE GAME', id: 'feedback-done', wide: true })}
      </div>`;
    const done = document.getElementById('feedback-done');
    if (done) { done.onclick = () => close(true); done.focus(); }
    else gate.querySelector<HTMLAnchorElement>('a.k-cta')?.focus();
  }

  function close(given: boolean) {
    if (!given) {
      // Where they stopped, which is the one thing a half-filled form can still
      // say: a questionnaire everybody leaves on the same screen has a bad
      // question on it.
      track(`${followUp ? 'rating-more-left' : 'feedback-left'}-${step}`, `Feedback left at screen ${step}`);
    }
    document.removeEventListener('keydown', onKey);
    gate.remove();
    options.onDone?.(given || feedbackGiven());
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    // The game's own Escape pauses an innings. The sheet is in front of it, so
    // this one closes the sheet and goes no further.
    event.preventDefault();
    event.stopPropagation();
    close(false);
  }

  function find(id: string) { return gate.querySelector<HTMLElement>(`#${id}`)!; }
}

/**
 * The shared link, as a page of its own.
 *
 * Not the game with a form over it: a friend who followed a link has no innings
 * behind the sheet to darken, so the sheet stands on the game's own navy with
 * nothing else on the screen. Nothing three-dimensional is built and nothing is
 * downloaded to build it — see `main.ts`, which decides between this and the
 * game before either is imported.
 */
export function feedbackPage(root: HTMLElement) {
  document.body.classList.add('feedback-page');
  document.documentElement.classList.toggle(
    'touch-device',
    matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0,
  );
  openFeedback({
    root,
    standalone: true,
    context: { device: document.documentElement.classList.contains('touch-device') ? 'touch' : 'keyboard' },
    // The form is the whole page, so waving it away has nowhere to go. It opens
    // again rather than leaving a blank screen behind.
    onDone: given => { if (!given) feedbackPage(root); },
  });
}

/** One question, with its answers as rows: a round mark where one answer is taken, a square one where more are. */
function questionMarkup(question: Question, touch: boolean, picked: readonly string[]): string {
  const limit = question.pick ?? 1;
  const multi = limit > 1;
  // At the limit the rest go quiet, but stay live: a tap swaps the oldest out.
  const full = multi && picked.length >= limit;
  return `
    <div class="feedback-q">
      <h2 class="feedback-ask">${askOf(question, touch)}</h2>
      ${multi ? `<p class="feedback-note">${pickNote(limit, picked.length)}</p>` : ''}
    </div>
    <div class="feedback-choices" role="group" aria-label="${askOf(question, touch)}">${question.choices.map(choice => {
      const on = picked.includes(choice.id);
      return `
      <button class="feedback-choice${on ? ' is-on' : full ? ' is-quiet' : ''}" type="button" data-choice="${choice.id}" aria-pressed="${on}"><span>${choice.label}</span><i class="feedback-mark${multi ? ' is-box' : ''}">${TICK}</i></button>`;
    }).join('')}
    </div>`;
}

/** What the question that takes more than one says, as they are picked. */
function pickNote(limit: number, picked: number): string {
  if (picked >= limit) return `That’s ${limit === 2 ? 'two' : limit}. Tap one to swap it.`;
  if (picked > 0) return `Pick up to ${limit}. ${limit - picked === 1 ? 'One more' : 'More'} if you like.`;
  return `Pick up to ${limit}.`;
}

/**
 * The foot of the card: Back, and then the way on. A single answer moves on by
 * itself, so it gets a line saying so; the question that takes two gets SKIP
 * until something is picked and NEXT after; the words box gets SEND. The first
 * question has nothing to go back to, and needs no telling how to answer.
 */
function actionsMarkup(question: Question | null, picked: readonly string[], step: number): string {
  const back = '<button id="feedback-back" class="feedback-back" type="button">Back</button>';
  if (!question) return `<div class="feedback-actions">${back}${cta({ kind: 'primary', label: 'SEND', id: 'feedback-send' })}</div>`;
  if ((question.pick ?? 1) > 1) {
    return `<div class="feedback-actions">${step > 0 ? back : ''}${picked.length
      ? cta({ kind: 'primary', label: 'NEXT', id: 'feedback-next' })
      : cta({ kind: 'secondary', label: 'SKIP', id: 'feedback-next' })}</div>`;
  }
  return step > 0 ? `<div class="feedback-actions">${back}<p class="feedback-hint">Tap an answer to move on</p></div>` : '';
}

/** A kit key's words changed in place, or a plain button's. */
function labelled(key: HTMLElement, words: string) {
  const face = key.querySelector('.k-cta-face>span:last-child');
  (face ?? key).textContent = words;
}

/**
 * The one box anybody types in, and the only one. It is last on purpose: by the
 * time it appears the form has already been answered, so a blank box costs
 * nothing — and somebody who does have a sentence to write has just spent a
 * minute being reminded of what they thought.
 */
function suggestionMarkup(suggestion: string): string {
  return `
    <div class="feedback-q">
      <h2 class="feedback-ask">Anything you’d change?</h2>
      <p class="feedback-note">One line is plenty. Skip it if you’d rather.</p>
    </div>
    <label class="feedback-field">
      <textarea id="feedback-words" maxlength="${SUGGESTION_MAX}" rows="3" enterkeyhint="done"
        placeholder="Optional"></textarea>
      <span class="feedback-count"><b id="feedback-left">${SUGGESTION_MAX - suggestion.length}</b> left</span>
    </label>
    <p class="feedback-fine">Sent with your device type and this innings’ figures. No name, no email.</p>
    <p id="feedback-error" class="claim-error hidden" role="alert"></p>`;
}

function pipsMarkup(total: number, at: number): string {
  return `<div class="feedback-pips" role="presentation">${
    Array.from({ length: total }, (_, i) => `<i class="${i < at ? 'is-done' : i === at ? 'is-on' : ''}"></i>`).join('')
  }</div>`;
}

/** A choice tapped on the one question that takes two: on, off, or oldest out. */
function toggled(picked: readonly string[], id: string, limit: number): string[] {
  if (picked.includes(id)) return picked.filter(one => one !== id);
  // At the limit the oldest pick makes room, rather than the tap doing nothing.
  // A key that refuses to go down reads as broken; one that swaps reads as a
  // shortlist, which is what it is.
  return [...picked, id].slice(-limit);
}

function readDraft(): Draft {
  try {
    const held = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}') as Partial<Draft>;
    return {
      answers: held.answers && typeof held.answers === 'object' ? held.answers as FeedbackAnswers : {},
      suggestion: typeof held.suggestion === 'string' ? held.suggestion : '',
    };
  } catch { return { answers: {}, suggestion: '' }; }
}

function saveDraft(draft: Draft) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* Then it is not kept. */ }
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* Nothing to clear, then. */ }
}
