import { track } from '../game/analytics';
import { sendFeedback } from '../game/feedback-api';
import {
  PLAYED, SUGGESTION_MAX, askOf, feedbackGiven, markFeedbackGiven, playedFrom, questionsFor,
  type FeedbackAnswers, type FeedbackContext, type Question,
} from '../game/feedback';
import { gameLink } from '../game/Share';

/**
 * The questionnaire, as a screen.
 *
 * One question at a time, filling the card, with the answers as keys big enough
 * to hit without looking. Tapping one is the whole interaction: a single-answer
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
  /** Called when the sheet is gone, whether it was sent or waved away. */
  onDone?: (given: boolean) => void;
}

interface Draft {
  answers: FeedbackAnswers;
  suggestion: string;
}

export function openFeedback(options: FeedbackOptions) {
  const standalone = !!options.standalone;
  const touch = document.documentElement.classList.contains('touch-device');
  const draft = readDraft();
  const answers: FeedbackAnswers = draft.answers;
  let suggestion = draft.suggestion;
  let step = 0;
  let sending = false;

  track(standalone ? 'feedback-open-link' : 'feedback-open', 'Feedback form opened');

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
  const questions = () => questionsFor({
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
    const pips = standalone && step === 0 ? '' : pipsMarkup(all.length, step);
    gate.innerHTML = `
      <div class="feedback-sheet">
        <div class="feedback-head">
          <span class="feedback-eyebrow">WHAT DID YOU THINK?</span>
          <button id="feedback-close" class="board-close" type="button" aria-label="Close">×</button>
        </div>
        ${pips}
        ${question ? questionMarkup(question, touch, answers[question.id] ?? []) : suggestionMarkup(suggestion)}
        ${step > 0 ? '<button id="feedback-back" class="ghost-link" type="button">Back</button>' : ''}
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
        saveDraft({ answers, suggestion });
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
      saveDraft({ answers, suggestion });
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
    key.textContent = 'SENDING…';
    const sent = await sendFeedback({
      playerId: options.playerId ?? null,
      answers,
      suggestion,
      context: { ...options.context, link: standalone || undefined },
    });
    sending = false;
    if (!sent.ok) {
      key.disabled = false;
      key.textContent = 'TRY AGAIN';
      find('feedback-error').textContent = `${sent.reason} Nothing you typed has been lost.`;
      find('feedback-error').classList.remove('hidden');
      track('feedback-failed', 'Feedback could not be sent');
      return;
    }
    track('feedback-sent', 'Feedback sent');
    markFeedbackGiven();
    clearDraft();
    thanks();
  }

  /**
   * The last screen. On the shared link it is also the first time the game is
   * offered: somebody who has just spent a minute answering questions about it
   * should not have to go and find it.
   */
  function thanks() {
    gate.innerHTML = `
      <div class="feedback-sheet feedback-thanks">
        <span class="feedback-eyebrow">SENT</span>
        <h2>Thank you — that is genuinely useful.</h2>
        <p>Every answer is read. The next version is built out of these.</p>
        ${standalone
          ? `<a class="key-button" href="${gameLink()}">PLAY HITMAN CRICKET</a>`
          : '<button id="feedback-done" class="key-button" type="button">BACK TO THE GAME</button>'}
      </div>`;
    const done = document.getElementById('feedback-done');
    if (done) { done.onclick = () => close(true); done.focus(); }
    else gate.querySelector<HTMLAnchorElement>('.key-button')?.focus();
  }

  function close(given: boolean) {
    if (!given) {
      // Where they stopped, which is the one thing a half-filled form can still
      // say: a questionnaire everybody leaves on the same screen has a bad
      // question on it.
      track(`feedback-left-${step}`, `Feedback left at screen ${step}`);
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

/** One question, with its answers as keys. */
function questionMarkup(question: Question, touch: boolean, picked: readonly string[]): string {
  const multi = (question.pick ?? 1) > 1;
  return `
    <h2 class="feedback-ask">${askOf(question, touch)}</h2>
    ${multi ? `<p class="feedback-note">Pick up to ${question.pick}.</p>` : ''}
    <div class="feedback-choices" role="group" aria-label="${askOf(question, touch)}">${question.choices.map(choice => `
      <button class="feedback-choice${picked.includes(choice.id) ? ' is-on' : ''}" type="button" data-choice="${choice.id}" aria-pressed="${picked.includes(choice.id)}">${choice.label}</button>`).join('')}
    </div>
    ${multi ? `<button id="feedback-next" class="key-button" type="button">${picked.length ? 'NEXT' : 'SKIP'}</button>` : ''}`;
}

/**
 * The one box anybody types in, and the only one. It is last on purpose: by the
 * time it appears the form has already been answered, so a blank box costs
 * nothing — and somebody who does have a sentence to write has just spent a
 * minute being reminded of what they thought.
 */
function suggestionMarkup(suggestion: string): string {
  return `
    <h2 class="feedback-ask">Anything you’d change?</h2>
    <p class="feedback-note">One line is plenty. Skip it if you’d rather.</p>
    <label class="feedback-field">
      <textarea id="feedback-words" maxlength="${SUGGESTION_MAX}" rows="3" enterkeyhint="done"
        placeholder="Optional"></textarea>
      <span class="feedback-count"><b id="feedback-left">${SUGGESTION_MAX - suggestion.length}</b> left</span>
    </label>
    <p id="feedback-error" class="claim-error hidden" role="alert"></p>
    <button id="feedback-send" class="key-button" type="button">SEND</button>
    <p class="feedback-fine">Sent with your device type and this innings’ figures. No name, no email.</p>`;
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
