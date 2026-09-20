import { describe, expect, it } from 'vitest';
import { emptyBlast, emptySurvive } from '../src/game/career';
import {
  STATS_CARD, blastFacts, statsAlt, statsCardHeight, statsCardSpots, statsExplain, statsFacts,
  statsHitBoxes, surviveFacts,
} from '../src/game/StatsCard';
import { statsSheetMarkup } from '../src/ui/StatsSheet';
import { TIERS, foundingGrant } from '../src/game/tier';
import { statsShareText, statsStoryText, statsWhatsappLink, statsFileName } from '../src/game/Share';

const blast = {
  ...emptyBlast(),
  innings: 12, runs: 900, balls: 300, sixes: 40, fours: 30, highest: 140, notOut: 132,
  individual: 132, hundreds: 2,
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

  it('carries what one batsman made apart from what the innings made', () => {
    // 140 is the innings and 132 is the batsman; the card is the one screen
    // that shows both and says which is which.
    const figures = blastFacts(blast).figures;
    expect(figures.find(one => one.label === 'Best ind.')?.value).toBe(132);
    expect(blastFacts(blast).hero.find(one => one.label === 'Highest')?.value).toBe(140);
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
    for (const [label, value] of [['Runs', 900], ['Highest', 140], ['Best ind.', 132], ['Sixes', 40]] as const) {
      expect(alt).toContain(`${label} ${value}`);
    }
  });
});

describe('the drawn card', () => {
  /** The same card, with a made-up number of small figures on it. */
  const holding = (count: number) => ({
    ...statsFacts('classic', blast, { name: 'R', avatar: 0 }),
    figures: Array.from({ length: count }, (_, i) => ({ label: `F${i}`, value: i })),
  });

  it('grows a row for a career with more figures on it', () => {
    // Four figures fit one row; five need two, and the card has to be taller.
    expect(statsCardHeight(holding(5))).toBeGreaterThan(statsCardHeight(holding(4)));
    // And no taller again until the row after that is needed.
    expect(statsCardHeight(holding(8))).toBe(statsCardHeight(holding(5)));
  });

  it('spreads the figures over the rows they take rather than filling from the left', () => {
    // Five at four-to-a-row would strand one cell under a full row. Three and
    // two is the same five figures, laid out.
    const wide = statsCardSpots(holding(4));
    const spread = statsCardSpots(holding(5));
    // Two hero tiles come first on both, so the grid starts after them.
    expect(new Set(wide.slice(2).map(spot => spot.y)).size).toBe(1);
    expect(new Set(spread.slice(2).map(spot => spot.y)).size).toBe(2);
    expect(spread.slice(2).filter(spot => spot.y === spread[2].y)).toHaveLength(3);
  });

  it('is the same width whatever it is holding', () => {
    expect(STATS_CARD.width).toBe(440);
    // Only the height moves with what is on it; a card that changed width with
    // its contents would not stack with the keys under it.
    expect(statsCardHeight(holding(4))).not.toBe(statsCardHeight(holding(5)));
  });

  it('puts a tap target on every figure, hero tiles included', () => {
    const facts = statsFacts('classic', blast, { name: 'R', avatar: 0 });
    const boxes = statsHitBoxes(facts);
    expect(boxes).toHaveLength(facts.hero.length + facts.figures.length);
    // Inside the picture, all of them, or the key would be off the card.
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.left + box.width).toBeLessThanOrEqual(100);
      expect(box.top + box.height).toBeLessThanOrEqual(100);
    }
  });

  it('never overlaps two tap targets, because a tap has to mean one figure', () => {
    const boxes = statsHitBoxes(statsFacts('survive', survive, { name: 'R', avatar: 0 }));
    for (const one of boxes) {
      for (const other of boxes) {
        if (one === other) continue;
        const apart = one.left + one.width <= other.left + 0.001
          || other.left + other.width <= one.left + 0.001
          || one.top + one.height <= other.top + 0.001
          || other.top + other.height <= one.top + 0.001;
        expect(apart).toBe(true);
      }
    }
  });
});

describe('what tapping a figure says', () => {
  it('explains every figure on both cards, because a nought needs a reason', () => {
    const cards = [
      statsFacts('classic', blast, { name: 'R', avatar: 0 }),
      statsFacts('survive', survive, { name: 'R', avatar: 0 }),
    ];
    for (const facts of cards) {
      for (const one of [...facts.hero, ...facts.figures]) {
        expect(statsExplain(one.label), one.label).toBeTruthy();
      }
    }
  });

  it('says what a hundred costs, since that is the rule nobody can see', () => {
    expect(statsExplain('Hundreds')).toContain('a new batsman in');
  });

  it('has nothing to say about a figure it has never heard of', () => {
    expect(statsExplain('Doosras')).toBeNull();
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

  it('carries a way back on the page, and none in the tab', () => {
    // The page is somewhere the player travelled to, so it has a way back. The
    // tab is one of three over the sheet, and the row above it is the way out —
    // a second one inside would be a way out of the tab to the same tab.
    expect(statsSheetMarkup({ facts, where: 'page' })).toContain('id="stats-back"');
    expect(statsSheetMarkup({ facts, where: 'sheet' })).not.toContain('id="stats-back"');
  });

  it('keeps the same card and the same keys wherever it is standing', () => {
    const page = statsSheetMarkup({ facts, where: 'page', picture: 'blob:x' });
    const tab = statsSheetMarkup({ facts, where: 'sheet', picture: 'blob:x' });
    for (const mark of ['id="stats-whatsapp"', 'id="stats-story"', 'src="blob:x"']) {
      expect(page).toContain(mark);
      expect(tab).toContain(mark);
    }
  });

  it('says the link rides along, and says so only once there is something to send', () => {
    expect(statsSheetMarkup({ facts })).toContain('link to play rides along');
    const empty = statsFacts('classic', emptyBlast(), { name: '', avatar: 0 });
    expect(statsSheetMarkup({ facts: empty })).toContain('Play an innings');
  });

  it('lays a key over every figure on the picture, and none where there is no picture', () => {
    const facts = statsFacts('classic', blast, { name: 'R', avatar: 0 });
    const drawn = statsSheetMarkup({ facts, picture: 'blob:card' });
    const keys = drawn.match(/class="stats-tap"/g) ?? [];
    expect(keys).toHaveLength(facts.hero.length + facts.figures.length);
    expect(drawn).toContain('data-stat="Hundreds"');
    // Nothing to lay a key over while the card is still being painted.
    expect(statsSheetMarkup({ facts })).not.toContain('stats-tap');
  });

  it('carries the toast the keys speak through, in both presentations', () => {
    const facts = statsFacts('classic', blast, { name: 'R', avatar: 0 });
    for (const where of ['sheet', 'page'] as const) {
      expect(statsSheetMarkup({ facts, picture: 'blob:card', where })).toContain('id="stats-toast"');
    }
  });

  it('makes the text fallback answer the same tap', () => {
    const facts = statsFacts('survive', survive, { name: 'R', avatar: 0 });
    const plain = statsSheetMarkup({ facts, failed: true });
    expect(plain).toContain('data-stat="Blows"');
    expect(plain).toContain('tabindex="0"');
  });

  it('tells a player the figures can be asked about, once there is something to ask', () => {
    const played = statsFacts('classic', blast, { name: 'R', avatar: 0 });
    expect(statsSheetMarkup({ facts: played, picture: 'blob:card' })).toContain('Tap any figure');
    // Nothing has been counted yet, so there is nothing worth asking about and
    // the line under the card has something more useful to say.
    const fresh = statsFacts('classic', emptyBlast(), { name: 'R', avatar: 0 });
    expect(statsSheetMarkup({ facts: fresh, picture: 'blob:card' })).not.toContain('Tap any figure');
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
    expect(at(349)).toBe('DEBUTANT');
    expect(at(350)).toBe('EMERGING PLAYER');
    expect(at(3600)).toBe('STAR');
    expect(at(12_000)).toBe('HITMAN');
    expect(at(99_999)).toBe('HITMAN');
  });

  it('keeps the ladder short enough for the words to mean something', () => {
    // Four rungs, and the list is the only place that decides. A seventh would
    // flatter the arithmetic and nobody else — the point of the badge is that a
    // player can say in one syllable what they are.
    expect(TIERS).toHaveLength(4);
    expect(TIERS.map(tier => tier.name)).toEqual(['DEBUTANT', 'EMERGING PLAYER', 'STAR', 'HITMAN']);
    // Strictly climbing in both modes, or a career could qualify for two rungs
    // at once and which one it got would be whichever the loop saw last.
    for (const mode of ['classic', 'survive'] as const) {
      expect(TIERS[0].at[mode]).toBe(0);
      for (let i = 1; i < TIERS.length; i++) {
        expect(TIERS[i].at[mode], `${TIERS[i].name}.${mode}`).toBeGreaterThan(TIERS[i - 1].at[mode]);
      }
    }
  });

  it('reads a Test career off balls faced, not runs', () => {
    // A blocker: two thousand balls survived for forty runs. Ranked on runs he
    // would be a DEBUTANT, which is exactly backwards for the mode whose whole
    // point is lasting — so the tier reads the figure that mode leads on.
    const blocker = { ...emptySurvive(), innings: 40, balls: 2000, runs: 40 };
    expect(statsFacts('survive', blocker, { name: 'R', avatar: 0 }).tier.name).toBe('STAR');
    expect(statsFacts('survive', { ...blocker, balls: 40 }, { name: 'R', avatar: 0 }).tier.name).toBe('DEBUTANT');
  });

  /**
   * The two ladders are set off measured play — about 140 runs a day in the
   * Blast against about 39 balls a day in the Test match — so that they cost
   * the same effort rather than carrying the same numbers. Held here as a
   * ratio with room either side, because the thresholds are round numbers a
   * person chose and will choose again.
   */
  it('costs the same effort in either mode', () => {
    for (const tier of TIERS.slice(1)) {
      const ratio = tier.at.classic / tier.at.survive;
      expect(ratio, `${tier.name} classic:survive`).toBeGreaterThan(2.8);
      expect(ratio, `${tier.name} classic:survive`).toBeLessThan(4.4);
    }
  });

  it('puts the second rung where a player reaches it on their second sitting', () => {
    // Roughly six or seven innings in either mode, at the measured averages of
    // ~54 runs and ~17 balls an innings. Early enough that anybody who comes
    // back sees it; late enough that one-and-done players never do.
    expect(TIERS[1].at.classic / 54).toBeGreaterThan(4);
    expect(TIERS[1].at.classic / 54).toBeLessThan(10);
    expect(TIERS[1].at.survive / 17).toBeGreaterThan(4);
    expect(TIERS[1].at.survive / 17).toBeLessThan(10);
  });

  it('says what the next rung wants, and stops saying it at the top', () => {
    const climbing = statsFacts('classic', { ...emptyBlast(), innings: 9, runs: 400 }, { name: 'R', avatar: 0 });
    expect(climbing.nextLine).toBe('3,200 runs to STAR');
    expect(climbing.ladder.next?.name).toBe('STAR');
    const top = statsFacts('classic', { ...emptyBlast(), innings: 300, runs: 20_000 }, { name: 'R', avatar: 0 });
    expect(top.ladder.next).toBeNull();
    expect(top.nextLine).toBe('Top of the ladder.');
  });

  it('measures the bar across the rung, not from nought', () => {
    // 1,975 is halfway between EMERGING PLAYER at 350 and STAR at 3,600. A bar
    // measured from nought would read just over half and crawl from there;
    // this one moves every time somebody plays.
    const half = statsFacts('classic', { ...emptyBlast(), innings: 40, runs: 1975 }, { name: 'R', avatar: 0 });
    expect(half.ladder.progress).toBeCloseTo(0.5, 1);
  });

  it('fills the bar at the top rather than leaving it stuck', () => {
    const top = statsFacts('classic', { ...emptyBlast(), innings: 300, runs: 20_000 }, { name: 'R', avatar: 0 });
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

  it('keeps a metal card black, by keeping its bloom off the ground', () => {
    // The one figure that decides whether a black card is black. At the navy
    // card's strength the same wash lifts the middle of a near-black ground
    // into haze, and the tier stops being black and silver.
    const navy = TIERS[0].theme.bloom;
    for (const tier of TIERS.slice(1)) {
      expect(tier.theme.bloom, tier.name).toBeLessThan(navy);
      expect(tier.theme.bloom, tier.name).toBeGreaterThan(0);
    }
  });

  it('keeps the metal grounds darker than the navy one', () => {
    // "Black should be more, silver and gold being accents" — so the accent
    // lives on the badge, the ring, the bar and the hairlines, and the ground
    // stays out of its way.
    const lightness = (hex: string) =>
      [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0) / 3;
    const navy = lightness(TIERS[0].theme.mid);
    for (const tier of TIERS.slice(1)) expect(lightness(tier.theme.mid), tier.name).toBeLessThan(navy);
  });

  it('keeps the first rung the only one that is not a metal', () => {
    // A first-innings card that arrived in gold would leave the top of the
    // ladder nothing to be.
    expect(TIERS[0].theme.metal).toBe(false);
    for (const tier of TIERS.slice(1)) expect(tier.theme.metal, tier.name).toBe(true);
  });

  it('carries the theme onto the facts the card is painted from', () => {
    const gold = statsFacts('classic', { ...emptyBlast(), innings: 220, runs: 13_000 }, { name: 'R', avatar: 0 });
    const navy = statsFacts('classic', { ...emptyBlast(), innings: 1, runs: 10 }, { name: 'R', avatar: 0 });
    expect(gold.tier.theme.accent).not.toBe(navy.tier.theme.accent);
    expect(gold.tier.theme.metal).toBe(true);
    expect(navy.tier.theme.metal).toBe(false);
  });
});

describe('the head start the first players get', () => {
  const tiny = { ...emptyBlast(), innings: 1, runs: 148, balls: 30, highest: 148 };

  it('hands the top five STAR and the next eleven EMERGING PLAYER', () => {
    expect(foundingGrant(1)?.key).toBe('star');
    expect(foundingGrant(5)?.key).toBe('star');
    expect(foundingGrant(6)?.key).toBe('emerging');
    expect(foundingGrant(16)?.key).toBe('emerging');
    expect(foundingGrant(17)).toBeNull();
    expect(foundingGrant(0)).toBeNull();
  });

  it('gives them the badge and the material without touching their figures', () => {
    // The whole point: 148 runs is what they scored, and 148 is what the card
    // says. It is built to be sent to other people.
    const facts = statsFacts('classic', tiny, { name: 'Ayush K', avatar: 0, granted: foundingGrant(1) });
    expect(facts.tier.name).toBe('STAR');
    expect(facts.tier.theme.metal).toBe(true);
    expect(facts.hero.find(one => one.label === 'Runs')?.value).toBe(148);
    expect(facts.innings).toBe(1);
  });

  it('says what the tier was for instead of what is left to it', () => {
    // "2,600 runs to HITMAN" under a badge somebody was handed for being third
    // reads as a demotion notice on the card that is meant to be the reward.
    const facts = statsFacts('classic', tiny, { name: 'Dhruv', avatar: 0, granted: foundingGrant(3) });
    expect(facts.nextLine).toBe('Founding place · 3rd on the board');
    expect(facts.ladder.granted?.key).toBe('star');
  });

  it('is a floor and never a ceiling', () => {
    // Given STAR for being early, then played their way past it. They keep what
    // they earned — the grant was to stop them starting at the bottom.
    const huge = { ...emptyBlast(), innings: 300, runs: 20_000 };
    const facts = statsFacts('classic', huge, { name: 'R', avatar: 0, granted: foundingGrant(2) });
    expect(facts.tier.name).toBe('HITMAN');
    // And once earned, the card goes back to talking about the climb.
    expect(facts.ladder.granted).toBeNull();
    expect(facts.nextLine).toBe('Top of the ladder.');
  });

  it('still reads as granted while the figures have not caught up', () => {
    const facts = statsFacts('classic', { ...emptyBlast(), innings: 4, runs: 600 },
      { name: 'R', avatar: 0, granted: foundingGrant(4) });
    // 600 runs earns EMERGING PLAYER; the grant is STAR, so STAR it is.
    expect(facts.tier.name).toBe('STAR');
    expect(facts.ladder.granted).not.toBeNull();
  });

  it('drops the climb from a granted card rather than standing it at nothing', () => {
    // The bar would sit empty — the figures are a long way below the rung they
    // were handed — and the line under it would repeat the badge word for word.
    const granted = statsFacts('classic', tiny, { name: 'R', avatar: 0, granted: foundingGrant(2) });
    const earned = statsFacts('classic', tiny, { name: 'R', avatar: 0, granted: null });
    expect(statsCardHeight(granted)).toBeLessThan(statsCardHeight(earned));
  });

  it('leaves everybody else to earn theirs', () => {
    const facts = statsFacts('classic', tiny, { name: 'R', avatar: 0, granted: null });
    expect(facts.tier.name).toBe('DEBUTANT');
    expect(facts.ladder.granted).toBeFalsy();
  });
});
