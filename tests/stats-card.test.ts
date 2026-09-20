import { describe, expect, it } from 'vitest';
import { emptyBlast, emptySurvive } from '../src/game/career';
import {
  STATS_CARD, blastFacts, statsAlt, statsCardHeight, statsFacts, surviveFacts,
} from '../src/game/StatsCard';
import { statsSheetMarkup } from '../src/ui/StatsSheet';
import { TIERS } from '../src/game/tier';
import { statsShareText, statsStoryText, statsWhatsappLink, statsFileName } from '../src/game/Share';

const blast = {
  ...emptyBlast(),
  innings: 12, runs: 900, balls: 300, sixes: 40, fours: 30, highest: 140, notOut: 132,
};
const survive = {
  ...emptySurvive(),
  innings: 9, runs: 120, balls: 400, sixes: 4, fours: 8, blows: 22, wins: 2, draws: 3, losses: 4,
};

describe('what the career card says', () => {
  it('leads a Blast career on runs and the highest innings', () => {
    expect(blastFacts(blast).hero.map(one => one.label)).toEqual(['Runs', 'Highest']);
    expect(blastFacts(blast).hero.map(one => one.value)).toEqual([900, 140]);
  });

  it('carries the best unbeaten score as its own figure', () => {
    // 140 for one is the higher score and the lesser innings; the card is the
    // one screen that shows both and says which is which.
    const figures = blastFacts(blast).figures;
    expect(figures.find(one => one.label === 'Best n.o.')?.value).toBe(132);
  });

  it('leads a Test career on balls faced and innings survived', () => {
    const hero = surviveFacts(survive).hero;
    expect(hero.map(one => one.label)).toEqual(['Balls faced', 'Survived']);
    // Survived is the two tiers he came through — the wins and the draws.
    expect(hero.map(one => one.value)).toEqual([400, 5]);
  });

  it('shows a Test career every result it can end in', () => {
    const labels = surviveFacts(survive).figures.map(one => one.label);
    expect(labels).toEqual(['Runs', 'Blows', 'Sixes', 'Fours', 'Won', 'Drawn', 'Lost']);
  });

  it('calls an unregistered player what the rest of the board calls them', () => {
    // The card is their figures whether or not they have a name, and the
    // biggest line on it cannot be blank.
    expect(statsFacts('classic', blast, { name: '', avatar: 0 }).name).toBe('You');
    expect(statsFacts('classic', blast, { name: 'Rohit', avatar: 2 }).name).toBe('Rohit');
  });

  it('knows whether anything has been counted at all', () => {
    expect(statsFacts('classic', emptyBlast(), { name: '', avatar: 0 }).played).toBe(false);
    expect(statsFacts('classic', blast, { name: '', avatar: 0 }).played).toBe(true);
  });

  it('names the ladder it was made in', () => {
    expect(statsFacts('classic', blast, { name: 'R', avatar: 0 }).modeName).toBe('The Blast');
    expect(statsFacts('survive', survive, { name: 'R', avatar: 0 }).modeName).toBe('Test Survival');
  });
});

describe('the card as a sentence', () => {
  it('reads out every figure, because a canvas says nothing to a screen reader', () => {
    const alt = statsAlt(statsFacts('classic', blast, { name: 'Rohit', avatar: 1 }));
    expect(alt).toContain('Rohit, EMERGING PLAYER, on The Blast: 12 innings');
    for (const [label, value] of [['Runs', 900], ['Highest', 140], ['Best n.o.', 132], ['Sixes', 40]] as const) {
      expect(alt).toContain(`${label} ${value}`);
    }
  });
});

describe('the drawn card', () => {
  it('grows a row for a career with more figures on it', () => {
    const one = statsFacts('classic', blast, { name: 'R', avatar: 0 });
    const two = statsFacts('survive', survive, { name: 'R', avatar: 0 });
    // Four figures fit one row; seven need two, and the card has to be taller.
    expect(statsCardHeight(two)).toBeGreaterThan(statsCardHeight(one));
  });

  it('is the same width whatever it is holding', () => {
    const one = statsFacts('classic', blast, { name: 'R', avatar: 0 });
    const two = statsFacts('survive', survive, { name: 'R', avatar: 0 });
    expect(STATS_CARD.width).toBe(440);
    // Only the height moves with what is on it; a card that changed width with
    // its contents would not stack with the keys under it.
    expect(statsCardHeight(one)).not.toBe(statsCardHeight(two));
  });
});

describe('what travels with the card', () => {
  const lead = { label: 'Runs', value: 900 };

  it('puts the playable link in the WhatsApp text', () => {
    // The whole difference between a brag and an invitation: a thread full of
    // somebody's numbers is a thread where nobody can go and beat them.
    const text = statsShareText(lead, 12, 'https://hitman-cricket.vercel.app/');
    expect(text).toContain('https://hitman-cricket.vercel.app/');
    expect(text).toContain('900 runs');
    expect(text).toContain('12 innings');
  });

  it('carries that text into WhatsApp\'s own link, encoded', () => {
    const link = statsWhatsappLink(lead, 12, 'https://x.test/');
    expect(link.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(link.slice('https://wa.me/?text='.length))).toBe(
      statsShareText(lead, 12, 'https://x.test/'));
  });

  it('puts the link in the story caption too', () => {
    expect(statsStoryText(lead, 12, 'https://x.test/')).toContain('https://x.test/');
  });

  it('names the two pictures for what they are', () => {
    // Flat colour and sharp type travels as a PNG; a photograph with type on it
    // travels as a JPEG, which is what the apps would re-encode it to anyway.
    expect(statsFileName('card')).toMatch(/\.png$/);
    expect(statsFileName('story')).toMatch(/\.jpg$/);
  });
});

describe('the card\'s sheet', () => {
  const facts = statsFacts('classic', blast, { name: 'Rohit', avatar: 1 }, '4th on Boundaries');

  it('offers the two keys, whatever the picture is doing', () => {
    for (const view of [{ facts }, { facts, picture: 'blob:x' }, { facts, failed: true }]) {
      const markup = statsSheetMarkup(view);
      expect(markup).toContain('id="stats-whatsapp"');
      expect(markup).toContain('id="stats-story"');
      expect(markup).toContain('BRAG STATS ON WHATSAPP');
      expect(markup).toContain('SHARE TO INSTA STORY');
    }
  });

  it('says it is drawing before there is a picture', () => {
    expect(statsSheetMarkup({ facts })).toContain('Drawing your card…');
  });

  it('shows the painted picture once there is one, described in words', () => {
    const markup = statsSheetMarkup({ facts, picture: 'blob:abc' });
    expect(markup).toContain('src="blob:abc"');
    expect(markup).toContain('alt="Rohit, EMERGING PLAYER, on The Blast: 12 innings');
    expect(markup).not.toContain('Drawing your card');
  });

  it('shows the figures as text where the picture could not be drawn', () => {
    const markup = statsSheetMarkup({ facts, failed: true });
    expect(markup).toContain('<dd>900</dd>');
    expect(markup).toContain('<dd>132</dd>');
    expect(markup).toContain('could not be drawn');
  });

  it('carries a way out', () => {
    expect(statsSheetMarkup({ facts })).toContain('id="stats-close"');
  });

  it('says the link rides along, and says so only once there is something to send', () => {
    expect(statsSheetMarkup({ facts })).toContain('link to play rides along');
    const empty = statsFacts('classic', emptyBlast(), { name: '', avatar: 0 });
    expect(statsSheetMarkup({ facts: empty })).toContain('Play an innings');
  });

  it('writes a name in as text and never as markup', () => {
    const nasty = statsFacts('classic', blast, { name: '<img src=x>', avatar: 0 });
    const markup = statsSheetMarkup({ facts: nasty, failed: true });
    expect(markup).not.toContain('<img src=x>');
    expect(markup).toContain('&lt;img src=x&gt;');
  });
});

describe('the tier a career earns', () => {
  it('gives a first innings a badge rather than a blank', () => {
    // A card with nothing where the badge goes is the one card nobody sends.
    const fresh = statsFacts('classic', { ...emptyBlast(), innings: 1, runs: 6 }, { name: '', avatar: 0 });
    expect(fresh.tier.name).toBe('DEBUTANT');
  });

  it('climbs with the figure the mode already leads on', () => {
    const at = (runs: number) => statsFacts('classic', { ...emptyBlast(), innings: 9, runs }, { name: 'R', avatar: 0 }).tier.name;
    expect(at(0)).toBe('DEBUTANT');
    expect(at(249)).toBe('DEBUTANT');
    expect(at(250)).toBe('EMERGING PLAYER');
    expect(at(1200)).toBe('STAR');
    expect(at(4000)).toBe('HITMAN');
    expect(at(99_999)).toBe('HITMAN');
  });

  it('keeps the ladder short enough for the words to mean something', () => {
    // Four rungs, and the list is the only place that decides. A seventh would
    // flatter the arithmetic and nobody else — the point of the badge is that a
    // player can say in one syllable what they are.
    expect(TIERS).toHaveLength(4);
    expect(TIERS.map(tier => tier.name)).toEqual(['DEBUTANT', 'EMERGING PLAYER', 'STAR', 'HITMAN']);
    // Strictly climbing, or a career could qualify for two rungs at once.
    for (let i = 1; i < TIERS.length; i++) expect(TIERS[i].at).toBeGreaterThan(TIERS[i - 1].at);
    expect(TIERS[0].at).toBe(0);
  });

  it('reads a Test career off balls faced, not runs', () => {
    // A blocker: two thousand balls survived for forty runs. Ranked on runs he
    // would be a DEBUTANT, which is exactly backwards for the mode whose whole
    // point is lasting — so the tier reads the figure that mode leads on.
    const blocker = { ...emptySurvive(), innings: 40, balls: 2000, runs: 40 };
    expect(statsFacts('survive', blocker, { name: 'R', avatar: 0 }).tier.name).toBe('STAR');
    expect(statsFacts('survive', { ...blocker, balls: 40 }, { name: 'R', avatar: 0 }).tier.name).toBe('DEBUTANT');
  });

  it('says what the next rung wants, and stops saying it at the top', () => {
    const climbing = statsFacts('classic', { ...emptyBlast(), innings: 9, runs: 400 }, { name: 'R', avatar: 0 });
    expect(climbing.nextLine).toBe('800 runs to STAR');
    expect(climbing.ladder.next?.name).toBe('STAR');
    const top = statsFacts('classic', { ...emptyBlast(), innings: 300, runs: 9_000 }, { name: 'R', avatar: 0 });
    expect(top.ladder.next).toBeNull();
    expect(top.nextLine).toBe('Top of the ladder.');
  });

  it('measures the bar across the rung, not from nought', () => {
    // 725 is halfway between REGULAR at 250 and STAR at 1,200. A bar measured
    // from nought would read three fifths full and crawl; this one moves every
    // time somebody plays.
    const half = statsFacts('classic', { ...emptyBlast(), innings: 9, runs: 725 }, { name: 'R', avatar: 0 });
    expect(half.ladder.progress).toBeCloseTo(0.5, 1);
  });

  it('fills the bar at the top rather than leaving it stuck', () => {
    const top = statsFacts('classic', { ...emptyBlast(), innings: 300, runs: 9_000 }, { name: 'R', avatar: 0 });
    expect(top.ladder.progress).toBe(1);
  });

  it('puts the tier in the text fallback and in what a screen reader hears', () => {
    const facts = statsFacts('classic', blast, { name: 'Rohit', avatar: 1 });
    expect(statsAlt(facts)).toContain('EMERGING PLAYER');
    expect(statsSheetMarkup({ facts, failed: true })).toContain('EMERGING PLAYER');
  });
});

describe('what a card is made of', () => {
  it('gives every rung a whole palette, not just an accent', () => {
    for (const tier of TIERS) {
      for (const key of ['top', 'mid', 'bottom', 'ledge', 'mat', 'ink', 'quiet', 'accent', 'sheen', 'rule', 'tileTop', 'tileBottom'] as const) {
        expect(tier.theme[key], `${tier.name}.${key}`).toMatch(/^#[0-9a-f]{6,8}$/i);
      }
    }
  });

  it('climbs through four materials rather than four shades of one', () => {
    // Navy, bronze, black and silver, black and gold. Two rungs that shared a
    // ground would be the same card with a different word on it, which is the
    // whole thing the theme exists to stop.
    const grounds = TIERS.map(tier => tier.theme.mid);
    expect(new Set(grounds).size).toBe(TIERS.length);
    const accents = TIERS.map(tier => tier.theme.accent);
    expect(new Set(accents).size).toBe(TIERS.length);
  });

  it('keeps the first rung the only one that is not a metal', () => {
    // A first-innings card that arrived in gold would leave the top of the
    // ladder nothing to be.
    expect(TIERS[0].theme.metal).toBe(false);
    for (const tier of TIERS.slice(1)) expect(tier.theme.metal, tier.name).toBe(true);
  });

  it('carries the theme onto the facts the card is painted from', () => {
    const gold = statsFacts('classic', { ...emptyBlast(), innings: 90, runs: 5000 }, { name: 'R', avatar: 0 });
    const navy = statsFacts('classic', { ...emptyBlast(), innings: 1, runs: 10 }, { name: 'R', avatar: 0 });
    expect(gold.tier.theme.accent).not.toBe(navy.tier.theme.accent);
    expect(gold.tier.theme.metal).toBe(true);
    expect(navy.tier.theme.metal).toBe(false);
  });
});
