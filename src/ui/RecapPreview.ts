import { ALL_BATS, ALL_OUTFITS } from '../game/dressing';
import { SUPER10_KITS } from '../game/super10-kits';
import { avatarSrc } from '../config/board';
import { emptyRecap, type YearRecap } from '../game/recap';
import { recapPosters, type RecapInput } from '../game/recap-view';
import { openRecap } from './Recap';

/**
 * `?recap=1`: the year recap over made-up seasons, for looking at it on a
 * phone before December — a key a player along the foot, each a season the
 * posters have to hold: a big one, a first fortnight, one in the middle of the
 * pack and one near the foot of it. Nothing is read from the store, counted
 * or sent. A page, not the game, decided in `main.ts` before the game is
 * imported, as `?ui=1` is.
 */

const at = (month: number, day: number, hour = 12) => Date.UTC(2026, month - 1, day, hour - 5, 30);
const days = (from: [number, number], n: number, each: number) => Object.fromEntries([...Array(n)].map((_, i) => {
  const d = new Date(Date.UTC(2026, from[0] - 1, from[1] + i));
  return [`${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`, each + (i % 3)];
}));

interface Sample { key: string; name: string; avatar: number; kit: string; bat: string; record: YearRecap; standings: RecapInput['standings']; nextKit?: string; nextBat?: string }

const SAMPLES: Sample[] = [
  {
    key: 'KABIR', name: 'Kabir', avatar: 1, kit: 'electric', bat: 'rage',
    record: {
      ...emptyRecap(at(9, 8)), innings: 186, first: at(9, 8), last: at(12, 1),
      modes: {
        classic: { innings: 90, runs: 2140, balls: 1100, fours: 260, sixes: 160, best: 148, fifties: 20, hundreds: 5, wins: 0 },
        super10: { innings: 40, runs: 1310, balls: 700, fours: 150, sixes: 110, best: 141, fifties: 6, hundreds: 2, wins: 0 },
        marathon: { innings: 30, runs: 960, balls: 900, fours: 90, sixes: 30, best: 120, fifties: 4, hundreds: 0, wins: 0 },
        survive: { innings: 26, runs: 410, balls: 600, fours: 40, sixes: 12, best: 44, fifties: 1, hundreds: 0, wins: 4 },
      },
      kits: { electric: 121, papaya: 38, home: 27 }, bats: { rage: 97, boom: 52, plain: 37 },
      days: { ...days([9, 8], 6, 1), ...days([10, 2], 4, 2), ...days([11, 11], 11, 3) }, hours: { 1: 50, 0: 21, 14: 30, 19: 40, 22: 20, 9: 25 },
    },
    standings: { classic: { place: 1204, of: 13480 }, super10: { place: 900, of: 6400 }, marathon: { place: 1400, of: 6300 } },
  },
  {
    key: 'RIYA', name: 'Riya Sen', avatar: 0, kit: 'violet', bat: 'icecold',
    record: {
      ...emptyRecap(at(10, 1)), innings: 64, first: at(10, 1), last: at(12, 8),
      modes: {
        classic: { innings: 30, runs: 760, balls: 520, fours: 120, sixes: 22, best: 92, fifties: 5, hundreds: 0, wins: 0 },
        survive: { innings: 34, runs: 880, balls: 2100, fours: 70, sixes: 4, best: 71, fifties: 3, hundreds: 0, wins: 9 },
      },
      kits: { violet: 40, gold: 24 }, bats: { icecold: 44, venom: 20 },
      days: { ...days([10, 1], 3, 2), ...days([11, 3], 5, 1), '12-08': 4 }, hours: { 14: 20, 13: 12, 15: 10, 21: 22 },
    },
    standings: { classic: { place: 5122, of: 13480, best: 92, bars: { state: 113 } } },
  },
  {
    key: 'DEV', name: 'Dev', avatar: 3, kit: 'crimson', bat: 'boom',
    record: {
      ...emptyRecap(at(11, 2)), innings: 31, first: at(11, 2), last: at(12, 5),
      modes: { classic: { innings: 24, runs: 410, balls: 400, fours: 40, sixes: 12, best: 55, fifties: 1, hundreds: 0, wins: 0 }, super10: { innings: 7, runs: 380, balls: 300, fours: 30, sixes: 18, best: 96, fifties: 2, hundreds: 0, wins: 0 } },
      kits: { crimson: 19, home: 12 }, bats: { boom: 31 },
      days: { '11-02': 3, '11-03': 2, '11-14': 4, '11-20': 6, '12-05': 5, '11-21': 2 }, hours: { 7: 12, 8: 10, 18: 9 },
    },
    standings: { classic: { place: 10514, of: 13480, best: 55, bars: { club: 64 } } }, nextBat: 'rage',
  },
  {
    key: 'ARJUN', name: 'Arjun', avatar: 4, kit: 'home', bat: 'plain',
    record: {
      ...emptyRecap(at(12, 2)), innings: 10, first: at(12, 2), last: at(12, 9),
      modes: { classic: { innings: 10, runs: 142, balls: 120, fours: 9, sixes: 0, best: 31, fifties: 0, hundreds: 0, wins: 0 } },
      kits: { home: 10 }, bats: { plain: 10 }, days: { '12-02': 6, '12-09': 4 }, hours: { 14: 7, 13: 3 },
    },
    standings: { classic: { place: 40, of: 120 } }, nextKit: 'crimson', nextBat: 'boom',
  },
];

const kitNames = Object.fromEntries([...ALL_OUTFITS.map(o => [o.id, o.name]), ...SUPER10_KITS.map(k => [k.id, k.name])]);
const batNames = Object.fromEntries(ALL_BATS.map(b => [b.id, b.name]));
const kitColours = Object.fromEntries([...ALL_OUTFITS.map(o => [o.id, { shirt: o.shirt, trim: o.trim, pads: o.pads }]), ...SUPER10_KITS.map(k => [k.id, { shirt: k.shirt, trim: k.trim, pads: k.trousers }])]);

export function recapPreview(root: HTMLElement) {
  document.body.style.background = '#0B0B0F';
  const keys = document.createElement('div');
  keys.className = 'rc-keys';
  let open: { close(): void } | null = null;
  const play = async (sample: Sample) => {
    keys.querySelectorAll('button').forEach(b => b.classList.toggle('is-on', b.textContent === sample.key));
    const posters = recapPosters({
      year: 2026, name: sample.name, record: sample.record, kitNow: sample.kit, batNow: sample.bat, guardNow: 'sterling',
      standings: sample.standings, nextKit: sample.nextKit, nextBat: sample.nextBat, kitNames, batNames, kitColours,
      seed: sample.avatar * 31 + sample.name.length, now: Date.UTC(2026, 11, 10),
    });
    open?.close();
    const start = Number(new URLSearchParams(location.search).get('poster') ?? 1) - 1;
    open = await openRecap(root, posters, { avatar: avatarSrc(sample.avatar), start, foot: 44, onClose: () => { open = null; } });
  };
  for (const sample of SAMPLES) {
    const b = document.createElement('button');
    b.textContent = sample.key;
    b.addEventListener('click', () => void play(sample));
    keys.append(b);
  }
  root.append(keys);
  const asked = new URLSearchParams(location.search).get('player')?.toUpperCase();
  void play(SAMPLES.find(s => s.key === asked) ?? SAMPLES[0]);
  (window as unknown as { __recap: object }).__recap = { samples: SAMPLES.map(s => s.key) };
}
