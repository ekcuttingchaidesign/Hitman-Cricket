# Test Marathon

A third mode, alongside The Blast and Test Survival: three wickets, as many
balls as the batting side can last, and as many runs as it can make. Single
player only — there is no Rivals version.

This is the spec it is built against. Every decision in it was made in
conversation before a line of the mode was written; where something is still
open it says so, under **Open questions** at the end, with the default it will
be built with if nobody says otherwise.

## The innings

| | |
| --- | --- |
| Wickets | 3. Three batters, one after another. |
| Balls | No limit in the rules; a hard stop at **500 balls** (83 overs and 2 balls). |
| Objective | The most runs. There is no target. |
| Ground | The stadium, **always by day**, whatever the clock says — it is a Test. |
| Clothing | Whites, the Test field, as in Test Survival. |

### How it ends

An innings ends, and counts toward a career, on any of these — and on nothing
else:

1. **The third batter is out or retired hurt.**
2. **The 500th ball is bowled.**
3. **The player declares.** Allowed from over 20 onwards (see Open questions
   for the exact ball); not before. The pause card carries the key.

Closing the tab, reloading, or restarting mid-innings does **not** count it,
exactly as in the other modes: the one call that counts an innings stays in
`end`. Players play a Marathon in one go.

### The three batters

- **Skill falls with each wicket.** Batter 1's timing windows are close to the
  Blast's; batter 3's are Test Survival's tailender's; batter 2's sit between.
  Starting points, to be tuned with the simulator:

  | | perfect | good | ok | poor (ms) |
  | --- | --- | --- | --- | --- |
  | Batter 1 (opener) | 36 | 70 | 122 | 195 |
  | Batter 2 | 27 | 55 | 100 | 180 |
  | Batter 3 (tailender) | 18 | 40 | 78 | 165 |

  The drop is said on screen when each batter walks out — a name and a role
  (opener, No. 3, tailender) — because a timing window that narrows without a
  word reads as bad luck, not as a weaker batter.
- **One of the three bats left-handed, at random**, drawn once per innings off
  the innings seed so a seed replays the same innings. While he is in, the
  ground is mirrored (the stage is already flipped once in `GameScene`; this
  flips it back), the swipe directions are mirrored with it — a left-hander's
  pull is a swipe to the right — and the bowler is flipped back on his own so
  he stays right-arm, now bowling across him. Nothing announces him: after
  the playtest, a batter standing on the other side of the stumps was found
  to say it himself.
- **Retired hurt** works as in Test Survival — the injury meter, the same
  damage table, nothing heals — except that it brings the next batter in
  rather than ending the innings. A retired batter's score stands as **not
  out** (`143*`). Each batter walks out with a full meter.

## The bowling

The bowling is planned in blocks of ten overs, by the innings' over number,
not the batter's: a tailender who walks in at over 30 walks in against over
30's bowling.

| Overs | Pace (seam & swing) | Spin | Express (the Level 3 bowler) |
| --- | --- | --- | --- |
| 1–10 | 7, Test Survival's bowling — swinging from over 6 | 3 | — |
| 11–20 | 5, **more swing** (Level 2) | 2 | 3: the 11th, and two of the 13th–20th |
| 21 onwards, every 10 | 3, more swing | 3 | 4 |

- **The swing comes on at over 6**, half a block early: the first playtest
  made 284 in 22 overs, 240 of them by the opener, and found the gentle
  start too long. Who bowls each over is still the block's, so the express
  bowler's first over is still in 11–20.
- **The express bowler comes on with the 11th**, always, and has two more of
  the 13th to the 20th — never the 12th, because no bowler bowls two overs
  running, and never two of his together. He had the 11th alone at first;
  the next playtest asked for more of him before the 20th, and for every ten
  after it to be four of his, three of spin and three of swing.
- **Round the wicket, from over 6**: about three overs in ten, drawn per
  over and kept for the over (`ROUND`). The bowler runs in on the other side
  of the stumps and the ball leaves his hand out wide and angles in, to arrive
  where it would have from over the wicket — only the angle it is read from
  changes. Asked for after a playtest found every bowler bowling over the
  wicket. `?round=1` puts every over round the wicket, and `?nets=1` does
  that with keys to change the bowler — pace, swing, spin, sling — and the
  side, from the next ball, for trying every bowler round the wicket quickly.
- **Overs 1–10 are Test Survival's**, with one rule dropped: Survive gives its
  last two overs two bouncers each, because they are the end of its innings.
  Here they are the middle of one, so they are ordinary overs. Every pace
  over still has its one placed bouncer.
- **Level 2 is a swing bowler.** Level 1's swing is hardly noticeable. From
  Level 2 three in ten of his balls are inswingers, pitched on or outside off
  and coming back into the batter; three in ten are outswingers, pitched on
  middle or leg and going away; and the rest go straight, on any line. The
  swing is later and much further than Level 1's.
- **And reverse swing**, one in every over he swings it and a second in
  about half of them, never more, placed like the bouncer: straight to the
  pitch, then darting two to three stumps' width off it, in or out, at
  142–156 (141–147 on the gun). It is the one swinging ball that has to be read off the pitch
  rather than out of the air. `?reverse=1` bowls nothing else.
- **The express bowler** bowls all six balls of his overs at express pace
  (Test Survival's `EXPRESS`, 172–186 kph), varying the length: full and fast,
  **one bouncer every over and a second in about one over in three**, and **a
  yorker every over**. His one change of pace is **a slower ball, in about one
  over in two**, at 112–126. He uses the existing run-up with a quicker arm action and release;
  the release has to stay easy to read, because that is what a batter times
  off.
- **Injury is Test Survival's, unchanged.** A blow costs
  `DAMAGE[where] × (kph/140)²`, so his pace makes his blows dear by itself; no
  extra multiplier. Tuned with the simulator so that a fresh opener is carried
  off in **no more than about one express over in six**.
- **Where the overs fall inside a block** is drawn off the innings seed, as the
  spinner's over is now: never the same pattern twice, always the stated
  count.

### The level changes are told

- **The swing (over 6):** a banner — the ball has started to swing — and the
  sky clouds over a little, which is the condition every cricket fan already
  links with swing. It goes up on the first over the pace bowler swings it,
  which since the playtest is the sixth.
- **The express bowler is not told.** He had a banner for his spell at
  first; the second playtest took it off. The swing is a change in conditions
  nobody can see coming, and he is his own announcement.

## The milestones

The Blast's two moments are a fifty and a hundred. A Test innings goes past
both, so **every fifty is a moment**, each batter's own, counted from the
ball he walked out on:

| Mark | What he does | What goes up |
| --- | --- | --- |
| 50, 150, 250, 350 … | The fifty's raised bat, a second of it | The fifty: the number written beside him, a burst and stars. 150, 250, 350: a sticker of the number slapped on beside him, a googly-eyed ball peeking over it. The ground keeps its colours |
| 100 | The hundred, as in the Blast | The crown, the 100 on fire, fire up the edges, the ground greyed |
| 200 | The double biceps: elbows out at the shoulders, fists by the helmet, the bat stood up in his right fist; squeezed twice and shown to each side | A neon starburst behind him, a pink and cyan outline, retro stripes up the edges, the 200 in yellow bubble figures |
| 300 | Arms flung wide, a little above the shoulders, the bat out along the arm, head back | Wings opening behind him, a halo, a sky-blue outline, the 300 in white bubble figures |
| 400 | The champion: feet wide, the bat straight up at full stretch, the left fist pumped down by his hip; then the roar | A poster over the whole picture: navy starfield, the giant 400, spotlights, a podium under his feet with LARA'S CLUB round it, a yellow and navy outline |

Past four hundred, every hundred is four hundred's and every other fifty the
raised bat's. The numbers are the thing — written big, by hand, as the 50 and
the 100 are — and the word under them is small. The nearing card waits ten
short of every mark: the nervous 190s, 290s and 390s. The crowd keeps it up
longer for each: the big three take the whole of the clip.

## The speed gun

Every ball's speed is shown, the way a broadcast shows it — **in the
Marathon first**; the Blast and Test Survival can take the same reading later,
since it is one HUD element and one curve: a small reading by
the score bar the moment the ball leaves the hand — `142 km/h` — that stays
until the next ball. It shows on a phone, where the far end and the top of the
frame are the only places nobody's thumb is.

**The reading is realistic: 70 to 160 km/h, never more.** The speeds the game
bowls are tuned for play, not for a speed gun — Test Survival's express ball
is 172–186 internally — and they decide how fast the ball arrives and, squared,
what a blow costs. Changing them would retune the whole game. So they stay as
they are, and the gun reads them through a curve:

| Internal | Shown | |
| --- | --- | --- |
| up to 140 | the same (never under 70) | spin 82–96, slower balls 78–100, seam 118–140: already realistic |
| 140 to 186 | `140 + (kph − 140) × 20 ⁄ 46` | the quicks folded into 140–160 |

So the order is kept — an express ball always reads faster than a fast one,
which always reads faster than a seamer — while the top end lands where real
fast bowling does:

| Delivery | Internal | Shown |
| --- | --- | --- |
| Off spin | 84–96 | 84–96 |
| Seam (Blast) | 122–138 | 122–138 |
| Fast (Test) | 152–166 | 145–151 |
| Bouncer (Test) | 158–172 | 148–154 |
| Yorker (Test) | 160–174 | 149–155 |
| Express (Test; the Level 3 bowler) | 172–186 | 154–160 |

The curve lives in one function the HUD calls, with a test that pins its two
ends and its order. Nothing else reads it: flight time and injury keep using
the internal speed.

## The leaderboards

### The sheet's tabs

Rivals has not caught on, so its ranking leaves the leaderboard sheet and
moves into the **Rival Matches** screen, under the won–lost record already at
the top of it. The sheet's tabs become:

**The Blast · Test Survival · Test Marathon · My Stats**

— still four, so nothing about the tab row changes on a narrow phone. The
sheet still opens on the mode the player came from.

### The Marathon tab: two ladders behind a toggle

One row per player, their best, on each:

| Ladder | Ranked on, in order |
| --- | --- |
| **Team** | total runs → strike rate (fewer balls for the same runs) → boundaries (fours and sixes together) → earliest submission |
| **Individual** | runs → not out above out → fewer balls → earliest submission |

A team row reads *place · name · total · balls · strike rate · 4s+6s · how it
ended* (all out, retired, declared, 500 balls). An individual row reads
*place · name · `143*` · which batter (1/2/3) · balls*, with the left-hander
marked.

Strike rate is shown and is ranked on, but it is **stored as balls**: after
total runs, a higher strike rate is exactly fewer balls, and balls are a whole
number with no rounding in them. Strike rate is never the first key — ranked
first it would put 24 off 6 and out above 400 off 450.

### Packing

Each ladder is one sorted number, as the others are, so the store sorts it
natively and the browser can answer "do I qualify" with no network call.

| Ladder | Rank bits | Clock | Total |
| --- | --- | --- | --- |
| Team | runs 11 (≤ 2047) · 512 − balls 9 · boundaries 9 = **29** | **minutes** since launch, 22 bits (eight years) | 51 |
| Individual | runs 11 · not out 1 · 512 − balls 9 = **21** | seconds, 28 bits, as the others | 49 |

The team ladder keeps its clock in minutes, which the other two do not: it is
a new ladder with no settled ties to reshuffle, and seconds would leave the
rank only 25 bits. Two innings level on runs, balls and boundaries in the same
minute are a tie the clock does not split; the store keeps the first.

### One submission, both rows

The game sends one innings: the total, the balls, the boundaries, how it
ended, and each batter's runs, balls, out or not, and blows. The **store**
writes both ladder rows from it, so the two boards can never disagree, and
refuses what could not have happened:

- more than 500 balls, or runs above six a ball;
- the batters' runs not adding up to the total, or their balls to the balls;
- more than three batters out or retired, or a declaration before over 20;
- an innings ending at 500 balls with a wicket still standing that is not
  marked as such, and the meter rules Test Survival already enforces.

`?demo=1` fills both ladders with fifty made-up Marathon players, as it does
the others. `scripts/board-check.mjs` walks a submission against a preview
deployment.

## My Stats

A card in the carousel, second, between The Blast and Test Survival, on a
ground of its own — British Racing Green, with crimson rising from the foot
and in the trim, the tier's metal on the badge and bar:

- **The two big figures:** highest total and highest individual score.
- **Under them:** career runs, **runs per innings** (not an average — see
  below), fifties, hundreds and two-hundreds by any batter, and the longest
  innings in balls.
- A tier for the card, with its own thresholds in `src/game/tier.ts`.

**Runs per innings, not a batting average.** An average divides by
dismissals, and a declared or retired batter is not out, so a player who
batted carefully to over 20 and declared every time would have an average of
runs ÷ 0. Runs per innings counts every innings once, however it ended, and
the only way to raise it is to score more.

## How it looks

- The stadium, **by day** — the night is the Blast's.
- **A darker red ball** in the Test modes (a Dukes, rather than the Blast's
  brighter red), checked against the turf for how quickly it is picked up.
- **A greener pitch** in the Test modes.
- The Level 2 cloud cover (above).

## Where it lives

- `src/config/marathon.ts` — every number above, and nothing the other modes
  read, the way `src/config/survive.ts` is.
- `src/game/Marathon.ts` — the innings: batters, levels, the bowling plan,
  declaring, the end.
- The mode is a third `GameMode` everywhere `CLASSIC | SURVIVE` is now: the
  game, `?mode=marathon`, the board and career endpoints (`?mode=marathon`),
  `CareerMode`, the picker.
- Until it ships the mode has no card on the picker at all, and is reached
  only by `?mode=marathon`; a build flag, `VITE_SHOW_MARATHON`, will put the
  card up when there is a board behind it, the way `VITE_SHOW_SURVIVE` did.

## How it is checked

- **Unit tests** for the levels and the bowling plan, the batter windows, the
  left-hander's mirrored input, declaring, the ladders' packing (a test pins
  each budget, as `survive-board.test.ts` does) and the store's refusals.
- **`scripts/marathon-sim.ts`**, from `survive-sim.ts`: tunes the batter
  windows and the express bowler's bouncer rate, and reports how long an
  innings lasts for a competent and an expert player.
- **`scripts/marathon-check.mjs`**, a real browser, reaching each screen the
  way a player does: the batter announcements, the level banners, the declare
  key appearing at over 20 and not before, a left-hander's pull being a swipe
  to the right, and an innings that is walked out on not counting.
- The existing checks extended where the mode reaches them: `stats-check` for
  a green card second on the rail, `end-card-check` for the Marathon card,
  `career-count-check` for the counting rule.

## Build order

Each step is a pull request of its own, behind the flag until the last.

0. **This spec.**
1. **Groundwork.** *Done.* `src/game/modes.ts` holds the three modes and
   the one question both Test modes answer yes to (`isTest`: whites, the Test
   field, by day), kept apart from "is this Test Survival", which decides its
   rules. `src/server/mode.ts` reads the mode for the board, career and innings
   endpoints and the dev server alike, and turns `marathon` away with a 400
   until step 5 gives it a store — before it, anything not `survive` was taken
   for the Blast, so a Marathon innings would have landed on the Blast's
   board. No behaviour changes for the two modes that exist.
2. **The rules.** *Done.* Three batters and their windows, retired hurt
   bringing in the next, the bowling plan by levels, declaring, the 500-ball
   stop, the simulator, and tuning. Playable at `?mode=marathon`, on a
   placeholder card that sends nothing. Two things the simulator settled that
   the spec did not say: **each batter's block narrows with his windows**, by
   less — with one block for all three, the express bowler carried off an
   opener exactly as often as a tailender — and **a harder-swinging ball is held
   to the widest line a gentle one could finish on**, so more swing is never a
   wide. After the first playtest: the swing bowler bowls inswingers from on
   or outside off, outswingers from middle or leg and straight ones on any
   line, a third each, and swings it much further (2.6× Survival's); the
   express bowler bowls a yorker every over and a slower ball (112–126) in
   about one in two; and **the speed gun comes forward from step 4**, so the
   change of pace can be seen. The batter is named as he takes guard (`OPENER IN · TAKE YOUR
   GUARD`); the proper walk-out and level banners are step 4's. For trying
   the two new bowlers without batting to them, `?swing=1` and `?express=1`
   put the Level 2 swing bowler or the express bowler on from the first over
   (`marathonOnly` in `DeliveryGenerator.ts`).
3. **The left-hander.** *Done.* As specified, with two additions found in a
   browser: the LEG SIDE / OFF SIDE labels along the foot of the field swap
   while he is in, and `?lefty=1`–`3` (or `0` for none) puts him at a place in
   the order for testing. The tutorial's panel and arrow over his first ball
   came out after the playtest — it is obvious — and the end card's batting
   card marks him `LH`.
4. **Settling, the express bowler**, his action and release, and the level
   banners. *Done.* And, before the boards, **the milestones** above: every
   fifty a moment, the three big ones with celebrations of their own. The express bowler is a slinger, after a slow-motion
   reference of the most famous one: the ball carried at the chest in both
   hands, the hands parting at the leap, the front arm chopped down in front,
   the arm coming through wide and round with the body tilted hard away, and
   the arm carried on across the body as he runs off across the pitch — on
   the fast bowler's run-up and clock, releasing at the same moment from
   within a few centimetres of the same point, which a wider lane makes
   possible (`EXPRESS_ACTION`, tested against every rule the fast bowler's
   action is). A true sling lets go at shoulder height; the ball starts over
   his head, so the arm leans out as far as still reaches it. The first cut
   nudged the fast bowler's numbers and a playtest could not tell the two
   apart; the second, a Shoaib-style action pushed hard, bent the front arm
   the wrong way and stretched the spine in the fold, which the rig now
   refuses. *Settling*: every batter settles over 30 balls (36 at first,
   until the playtest found it too long), a blow knocking him back a ball per
   four points of injury, and settled, the meter
   is his confidence — a quarter full, filling a little more slowly than the
   Blast's (six +26, four +20, three +14, two +10, single or block +2, beaten
   −10, a blow −1 per four points) — which buys the Blast's special strokes.
   It was half the Blast's at first, which the second playtest found filled
   far too late; it is now the Blast's less two a stroke.
   The speed gun came forward to step 2, and moved off the scoreboard to a
   caption at the foot of the field after the playtest.
5. **The boards.** *Done.* The Rivals ranking is on Rival Matches, under the
   record: ten shown, *Show all* for the fifty, the player's own row always
   in view. The sheet's tabs are *The Blast · Test Survival · Test Marathon ·
   My Stats*, the Marathon's drawn only where the mode can be reached, and its
   two ladders sit behind a Team / Individual toggle (`src/ui/MarathonBoard.ts`).
   The store (`src/game/marathon-board.ts`, `submitMarathon` in
   `src/server/board-store.ts`) packs as above, refuses what could not have
   happened — sums batter by batter, the meter rules, one left-hander, nobody
   after a man still in, an ending the figures bear out — and writes both rows
   from one post, through the same `admit()` the other boards' checks now
   share. The end card offers a place in the boards' own strip, the team
   ladder's where the innings takes one and the individual's where only that
   one does, and sends nothing unless it is claimed; the career endpoints
   turned the mode away until step 6. `?demo=1` fills both ladders. And,
   agreed along the way: past 60 balls, leaving the page asks first
   (`MARATHON.warnFrom`) — an innings that long is an hour of somebody's
   evening.
6. **My Stats.** *Done.* The second card on the rail, between The Blast and
   Test Survival and in British Racing Green, wherever the mode can be played: highest total and best
   individual score as the two big figures, then career runs, runs per
   innings, fifties, hundreds, doubles and the longest innings in balls, and a
   tier in career runs at twice the Blast's rungs — 750, 7,500, 30,000 (`MARATHON_CAREER` in
   `src/game/career.ts`, `marathonFacts` in `StatsCard.ts`). A finished
   innings is counted in `end`, as every mode's is, from the very figures its
   boards are sent — so the career refuses exactly what the boards refuse —
   and a practice innings is not counted. No career ladders of its own yet:
   the two innings ladders are where it is ranked.
7. **The Test look.** *Done.* The darker ball (a Dukes's cherry, `0xa81c1c`,
   against the Blast's `0xe84829`) and the greener pitch, in both Test modes.
   A full green top was tried first and was too much; the strip keeps half
   the grass `pitchTexture` can paint.
   *After the second playtest:* the settle meter is **Focus**, and a first
   Marathon opens with four rules cards (three batters, Focus to settle, the
   pitch wears, declare then register), shown twice at most.
8. **Launch.** The What's New story is written: the update key is
   `marathon-launch`, the Rivals launch's two cards are replaced by two of the
   Marathon's (a photograph of the kit on the square across the whole screen,
   with four words on it, then *Play long, score big* over the worm and
   batting card from an end card), and the career key stays last. The
   photograph is laid under the whole story rather than placed in its column:
   its foot melts into a blur of itself that darkens into the words and the
   key, and wider than a phone the same blur fills the screen either side, so
   there is no edge anywhere where the picture stops. The first cut set it in
   the column with the words in outlined capitals over the sky, and a
   playtest found it placed rather than part of the screen. Turn the flag on
   (`VITE_SHOW_MARATHON`, which puts the card on production's picker and the
   Marathon tab on its board) in the same deploy as the merge — the story
   points at the mode, and on production without the flag the mode is not
   there to find. Then merge. Off production both are already there: the card went onto Select
   Mode on previews and the dev server during step 5, and then became the
   screen's hero card when Select Mode was laid out again from the Figma
   design, with the kit-on-the-square art from that design.

## Open questions

Each has the default it will be built with.

1. **When exactly declaring opens.** "From over 20" could mean the start of
   the 20th over (after 114 balls) or once 20 overs are done (after 120). The
   default is **after 120 balls**, which is also where the express bowler's
   own spells begin.
2. **The 500-ball stop ends two balls into the 84th over.** The default keeps
   **500** as decided; 498 (83 overs) or 480 (80 overs) would end on a whole
   over.
3. **A warning before leaving a long innings.** A phone can close a tab in the
   background and lose an innings. The default is **a "leave this innings?"
   prompt once the innings is past 60 balls**; nothing else is saved.
4. **Where the left-hander comes in.** The default is **any of the three, at
   random**, as decided; if playtests find the mirrored swipes cost an opener
   too many runs, he can be held to No. 2 or No. 3.
