import { describe, expect, it } from 'vitest';
import { emptyBlast, emptySurvive } from '../src/game/career';
import {
  STATS_CARD, blastFacts, statsAlt, statsCardHeight, statsFacts, surviveFacts,
} from '../src/game/StatsCard';
import { statsSheetMarkup } from '../src/ui/StatsSheet';
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
    expect(alt).toContain('Rohit on The Blast: 12 innings');
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
    expect(STATS_CARD.width).toBe(392);
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
    expect(markup).toContain('alt="Rohit on The Blast: 12 innings');
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
