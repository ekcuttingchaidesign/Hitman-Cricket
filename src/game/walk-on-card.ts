import type { BlastCareer, CareerMode, MarathonCareer, SurviveCareer } from './career';
import { statsFacts } from './StatsCard';

/**
 * The walk-on's player card (`src/ui/WalkOnCard.ts`): who is batting, as a
 * broadcast puts a batter up as he walks out — the face, the name, the mode
 * and the rung, and four figures from his career in the mode he is about to
 * bat in, or DEBUTANT where he has never batted in it: a debut in the Marathon
 * is a debut whatever he has made in the Blast.
 *
 * The figures are My Stats' own (`statsFacts`), from this browser's copy of
 * the career (`heldCareer`), so the card says what that page says and is
 * ready the moment the walk-on starts, before the store has answered anything.
 */
export interface WalkOnCard {
  name: string;
  avatar: number;
  mode: CareerMode;
  modeName: string;
  /** The rung in this mode: EMERGING PLAYER, STAR, HITMAN. */
  tier: string;
  /** No innings in this mode yet: DEBUTANT instead of the figures. */
  debut: boolean;
  figures: readonly { label: string; value: string }[];
}

/** Which four figures each mode puts on the card, and what the card calls each. */
const PICKS: Record<CareerMode, readonly [label: string, shown: string][]> = {
  classic: [['Innings', 'Innings'], ['Runs', 'Runs'], ['Highest', 'Highest'], ['Sixes', 'Sixes']],
  marathon: [['Innings', 'Innings'], ['Runs', 'Runs'], ['Best ind.', 'Best'], ['Hundreds', '100s']],
  survive: [['Innings', 'Innings'], ['Survived', 'Survived'], ['Won', 'Won'], ['Runs', 'Runs']],
};

export function walkOnCard(
  mode: CareerMode,
  career: BlastCareer | SurviveCareer | MarathonCareer,
  who: { name: string; avatar: number },
): WalkOnCard {
  const facts = statsFacts(mode, career, who);
  const known = new Map<string, number>([['Innings', facts.innings], ...[...facts.hero, ...facts.figures].map(one => [one.label, one.value] as const)]);
  return {
    name: facts.name,
    avatar: facts.avatar,
    mode,
    modeName: facts.modeName,
    tier: facts.tier.name,
    debut: !facts.played,
    figures: facts.played ? PICKS[mode].map(([label, shown]) => ({ label: shown, value: (known.get(label) ?? 0).toLocaleString('en-US') })) : [],
  };
}
