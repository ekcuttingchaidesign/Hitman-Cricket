import { describe, expect, it } from 'vitest';
import { ScoreManager } from '../src/game/ScoreManager';
import { shareFileName, shareFileType, shareText, storyText, whatsappLink } from '../src/game/Share';
import { CARD, STORY, cardFacts, cardHeight } from '../src/game/ShareCard';
import type { ShotOutcome } from '../src/game/types';

const ball = (runs: number, isWicket = false) => ({ runs, isWicket } as ShotOutcome);
const innings = (balls: ShotOutcome[]) => {
  const score = new ScoreManager();
  balls.forEach(b => score.record(b));
  return score;
};

describe('what the shared card says', () => {
  it('carries the same figures the card on screen carries', () => {
    const score = innings([ball(4), ball(6), ball(1), ball(0), ball(4)]);
    const facts = cardFacts(score, 0, true);
    expect(facts.runs).toBe(15);
    expect(facts.wickets).toBe(0);
    expect(facts.balls).toBe(5);
    expect(facts.overs).toBe(score.overs);
    expect(facts.fours).toBe(2);
    expect(facts.sixes).toBe(1);
    expect(facts.strikeRate).toBe(score.strikeRate);
  });

  it('names the innings the way the card does', () => {
    const done = innings(Array.from({ length: 30 }, () => ball(1)));
    expect(cardFacts(done, 40, false).title).toBe('Innings complete');
    expect(cardFacts(done, 10, true).title).toBe('New personal best');
    const out = innings([ball(0, true), ball(0, true), ball(0, true)]);
    expect(cardFacts(out, 40, false).title).toBe('All out');
  });

  it('says nothing about a best that does not exist yet', () => {
    const first = innings([ball(4)]);
    expect(cardFacts(first, 0, true).line).toBe('1 balls faced. First score on the board.');
    expect(cardFacts(first, 0, false).line).toBe('1 balls faced.');
    expect(cardFacts(first, 90, false).line).toContain('Your best stands at 90');
    expect(cardFacts(first, 90, true).line).toContain('past your old best of 90');
  });

  it('copies the innings rather than holding on to it', () => {
    const score = innings([ball(4), ball(0, true)]);
    const facts = cardFacts(score, 0, false);
    score.record(ball(6));
    expect(facts.history).toHaveLength(2);
    expect(facts.history[1]).toEqual({ runs: 0, isWicket: true });
  });
});

describe('what leaves the page', () => {
  it('sends the card as a PNG and the story as a JPEG', () => {
    expect(shareFileName(87, 'card')).toBe('hitman-cricket-87-runs-card.png');
    expect(shareFileName(87, 'story')).toBe('hitman-cricket-87-runs-story.jpg');
    expect(shareFileType('card')).toBe('image/png');
    expect(shareFileType('story')).toBe('image/jpeg');
  });

  it('puts the address in the caption, because the picture cannot be tapped', () => {
    const link = 'https://example.test/cricket/';
    expect(shareText(87, link)).toContain(link);
    expect(storyText(87, link)).toContain(link);
    expect(storyText(87, link)).toContain('87 runs');
  });

  it('keeps a text-only WhatsApp link for browsers that cannot carry a file', () => {
    const href = whatsappLink(87, 'https://example.test/');
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(href)).toContain('87 runs');
  });
});

describe('the frame the card is drawn in', () => {
  it('is a portrait 9:16 story', () => {
    expect(STORY.width / STORY.height).toBeCloseTo(9 / 16, 5);
  });

  it('draws the card at the width the stylesheet gives it', () => {
    expect(CARD.width).toBe(392);
    // Wide enough for the card and its side padding, tall enough to need scrolling
    // nowhere: the drawn card is one fixed block, so its height is a constant.
    expect(cardHeight()).toBeGreaterThan(CARD.padTop + CARD.padBottom + 78);
    expect(cardHeight()).toBeLessThan(CARD.width);
  });

  it('paints the card in the colours the stylesheet sets', () => {
    expect(CARD.face).toBe('#0f2738');
    expect(CARD.ink).toBe('#f7f0e5');
    expect(CARD.quiet).toBe('#9fb2bd');
    expect(CARD.ball).toBe('#e5473a');
    expect(CARD.record).toBe('#f2814f');
  });
});
