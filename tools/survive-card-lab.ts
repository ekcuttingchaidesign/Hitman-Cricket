import '../src/styles.css';
import { HUD } from '../src/ui/HUD';
import { ScoreManager } from '../src/game/ScoreManager';
import { SURVIVE } from '../src/config/survive';
import type { ShotOutcome } from '../src/game/types';
import { surviveOffer, asSurvive } from '../src/ui/SurviveBoard';
import { demoSurvive } from '../src/game/demo-board';

const hud = new HUD(document.getElementById('stage')!, 121);
const score = new ScoreManager({
  totalBalls: SURVIVE.totalBalls, maxWickets: SURVIVE.maxWickets, ballsPerOver: SURVIVE.ballsPerOver,
});
for (let i = 0; i < 2; i++) score.record({ runs: 0, isWicket: false } as ShotOutcome);
score.record({ runs: 0, isWicket: true } as ShotOutcome);
const health = { value: 70, blows: [1] };
hud.endSurvive(score, health, 'BOWLED_OUT', 197);
const me = 'abc123-defghijklmno';
const rows = demoSurvive(me);
const played = asSurvive(score, 1, 70);
hud.offerSurviveClaim(surviveOffer(true, rows, played, Date.now(), me), null, rows, played, me);
hud.career(true, 1);
