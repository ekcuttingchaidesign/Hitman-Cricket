# Hitman Cricket

A browser cricket game: Vite, TypeScript and three.js on the front, Vercel
serverless functions over Upstash Redis behind them. `README.md` is the long
document and explains the game, the boards and the careers; this file is only
the things a session needs to know before it touches anything.

## Going live

`docs/LAUNCH.md` is the running order for shipping the career update: seed the
careers, merge, deploy, rotate the token. Two of its steps cannot be undone,
and one of them takes the leaderboard down while it runs, so follow the order
rather than the summary.

## Production is the default branch

`hitman-cricket.vercel.app` serves `codex/cricket-batting-game`, the
repository's default branch. Feature branches get their own Vercel preview and
their own `preview:`-prefixed database keys, so a change is invisible on the
live URL until it is merged. Development happens on the branch named in the
session prompt, never straight onto the default branch.

## Credentials never enter the repository or the conversation

`KV_REST_API_TOKEN` can write. It belongs in Vercel and in the terminal of
whoever is running a script, and nowhere else — not in a commit, not in a
transcript, not in a screenshot. Where a command in a document needs one,
write `…` and let the reader paste their own. A token that has been seen
should be rotated by the four steps in `docs/LAUNCH.md`.

`KEY_SEAL_SECRET` is the same kind of thing. It is the secret career keys are
sealed with (`sealKey` in `src/server/career-key.ts`): thirty-two random bytes,
base64, set in Vercel — a different value for Production and Preview — and in
the terminal of whoever runs `scripts/key-show.ts`. With it and the database
together somebody holds every key, which is why it lives nowhere else. Make
one in your own terminal and paste it straight into Vercel:

    node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

Changing it later means every key sealed before can no longer be read back
(they still restore: a restore checks the hash, never the seal), so set it once.

## A player id never leaves the store

The player id is the only proof of who is writing — a score, a name, a
Dressing Room save, a password — so it is a secret between a browser and the
store. Anything the store answers about other players carries a handle instead
(`handleOf` in `src/game/handle.ts`: the first sixteen hex digits of a SHA-256
of the id, which cannot be turned back into it): every board row, the career
ladders, the Rivals ranking, and a challenge room, whose answer sits in the
edge cache for anybody holding the link. A browser finds its own row by
hashing its own id (`ownsHandle`), so code that says "is this row you" passes
the real id and lets the comparison hash it. A new answer that names other
players sends handles, never ids; `tests/handle.test.ts` holds the hash to
Node's own.

## Player profiles, the chase, and My profile

Figma section 14, "Player profiles" (node `333:11508`), four lanes; the
README's "Player profiles" is the long version.

- **A, another player**: any named row, podium step or chip on a board opens
  `src/ui/PlayerSheet.ts` over it (`openPlayer` in the HUD), drawn first from
  what the row knew (`PlayerSeed`) and then from `GET /api/profile?handle=`.
  Stats only, the face free on the rung's ground (`groundMarkup`, the colours
  in `src/profile.css`). Your own row opens My profile.
- **B, the chase**: CHASE holds their best (`Chase` in `src/game/chase.ts`,
  `this.chase` in `src/Game.ts`), and `chaseFor` in `board-api.ts` sends the
  handle with the next post of that mode. The intro holds the first ball on
  `bannerUntil`; the chip is `#chase-chip` under the scoreboard; PASSED waits
  for the dead ball and holds on `celebrating`; the end strip is `#chase-strip`,
  which stands in for the player card for a named player. A chase won is let go
  at the next start; one fallen short makes the key CHASE N AGAIN. The store
  judges it again, on runs, and that is what reaches the other player.
- **C, My profile**: `statsSheetMarkup` is the page, still the rail it was (the
  career cards keep `.stats-dot` and `data-slide`, so the rail's wiring is
  unchanged); the hero and ground per mode switch with it. The activity comes
  from `GET /api/profile?player=` when the page opens (`askActivity`), the
  sheet is `src/ui/Activity.ts`, and WIN IT BACK chases the runs that took it.
  The headline is Rank down, about the player and never who did it, and it
  stands two days at most (`HEADLINE_MS`): a WIN IT BACK innings played to
  its end card takes it down sooner, won or not (`src/game/answered.ts`, kept
  in the browser by handle and mode), and the cover's line goes with it. The
  mode switch is quiet tabs, the badge and the name with the pick underlined
  in its colour (Figma `367:12950`); no figures on them.
  The cover's `beaten` line reads the same.
- **D, the bio**: `bioFieldMarkup` in Your details, on the edit only, held to
  `bioProblem` (`src/server/bio-rules.ts`) in the browser and the store, and
  saved only where it changed, so a field drawn before the store answered
  never clears one.

A name runs to fourteen letters, too long for a key or the chip's lines, so
everything that puts their name on one line carries a form without it
(`data-short`: CHASE THEIR 187, OUTLAST THEM, TO BEAT THEIR 48-BALL WIN).
`fitLabels` in `src/ui/Kit.ts` measures the drawn line and swaps it in only
where the name does not fit; their face or name always stands beside it.

Looking is private and acting is public: a view is a count of handles a day
(`seen:<id>:<day>`), never a name; a chase or a pass carries the name, as a
score on a board does. Profiles open by handle; the store keeps handle → id
(`handles`), written on every post, counted innings and name claim. Players
named before it shipped need `scripts/handle-backfill.ts --write` once
(`docs/LAUNCH.md`), or their rows open nothing.

What the profiles are used for is `scripts/profile-report.ts`, read-only:
the store's tally (`profile-view`, `chase-beat`, `chase-short`, `passed`,
raised in `countView` and `afterPost`) beside the looks and events it holds.
The taps are GoatCounter's (`profile-open-…`, `activity-headline`,
`winback-…`), in the README's table.

`scripts/profile-check.mjs` walks all four lanes in a browser against the dev
server: a profile opened off a row, a chase fallen short and one won with the
store putting the beat on the other player's profile, then that player's My
profile, the sheet, the bio and WIN IT BACK in a second browser. It seeds its
own players under new letters each run.

An innings that passed somebody before profiles were live noted nothing, so
their My profile never led with Rank down. `scripts/note-pass.ts "Who went
past" "Who was passed"` writes the one event the store would have (`--mode`
for Survival or the Marathon, `--write` and the passed name typed again to
do it), dated when the innings was posted if that is inside the card's two
days and now otherwise, so the card shows. Run it after the merge: before,
the live site has no profile to show it on.

## The rank hero: the end card's player card

For a named player, once the store has said where the innings left them, the
end card's player card is the rank hero (Figma section 14E, V1): the place
big with a chip under it (UP and how far, NEW for a first row on the board,
or a grey HOLDS), the name and board over a headline (New best 181, Best 181
stands, or a chase's verdict with their name in gold) and a line under it,
then two answers side by side: who the innings surpassed, faces and names,
or the innings itself where it moved nobody; and who is next with what it
takes ("3 runs to surpass"), or Nobody ahead at #1. A chase fallen short has
its near miss the whole width instead (`chaseBarMarkup`). What it says is
`heroView` (`src/game/rank-hero.ts`, every case in `tests/rank-hero.test.ts`),
drawn by `rankHeroMarkup` (`src/ui/RankHero.ts`) into `#card-hero` at the top
of `.ec-player`, and `drawHero` in `src/Game.ts` draws it whenever the card is
offered again or the store answers. While it is up the old rank header, its
line of who was surpassed, the Next row and the chase's strip step aside
(`.has-hero`); they are still written, so guests, private windows, practice
and a Rival Match keep the card as it was, and so does the moment before the
store answers. Its first draw an innings arrives: the place counting from
where it was, the chip popping, the faces sliding in, and for a chase won one
wave of paper from the card's top corners. Player-facing copy says surpassed,
never passed; the store's event kind is still `'passed'`.

## New #1: the top of a board taken

When the store's answer to a post says the innings took the top of a board it
was not the top of before (`tookTheTop`: place 1, was not 1) and somebody was
there to take it from, New #1 plays over the end card before handing back
(Figma section 15, `src/ui/TopSpot.ts`, its view `topSpotView` in
`src/game/top-spot.ts`). Four acts on one clock, about four and a half
seconds: the card steps back and the board's top rows rise in with yours
below them, winding up; your row climbs past every row that stood above it,
flicking each down a place, and takes the top (one soft flash, gold rings, a
shake, the crowd); your face lifts out, a crown drops on, paper fountains up
from both bottom corners under turning rays and crossing spotlights; then the
lockup, #1 in gold foil, TOP OF THE BLAST and by how much, the podium rising
under you. Then #1 flies down on an arc into the rank hero's place figure,
which pops as it lands. A tap, Escape or Enter skips to that last move; under
reduced motion the lockup stands still for a moment. Haptics through the climb,
at the takeover and as the crown lands. A named player's real innings only:
never practice, a Rival Match or a demo, and once an innings. One innings
ends on one celebration at a time, New #1 first: a Level Up the same innings
earned waits for the store's answer to the post and then for New #1
(`levelUpAfter`; one already up has New #1 follow it, `topAfter`), and an
unlock the innings earned never goes up at all: it is noted as seen and
waits in the Dressing Room with its dot and its own UNLOCK key
(`celebrateUnlocks`, which also waits for the answer, a few tries). Every frame is drawn from
the clock, so the motion is the prototype's exactly (claude.ai artifact "New
#1 Celebration").

`?topspot=1` is a row of keys, BLAST, MARATHON and SURVIVAL, putting it up
over a made-up board, counting and sending nothing (`tests/practice.test.ts`
names it), and `__cricket.topSpot('marathon')` does the same for the checks,
with `__cricket.topSpotOpen()` to wait it out. A check that finishes an
innings on a dev server where it may take the top waits for that before it
clicks, or its click is a skip. `scripts/topspot-check.mjs` seeds three rivals
on the Blast board and bats past them with ninety career sixes counted
beforehand, so the innings earns Rage and a Level Up too (the ladder, the
lockup, the hand back to a #1 hero, Level Up after it, no unlock and Rage
waiting in the room, a tap to skip), then an innings under them (the hero, no New
#1), then the preview keys. Start the dev server fresh for it: its player
makes 180, the most a Blast can, so a board that already has one leaves
nobody to take the top from.

## Scripts that write are opt-in

`scripts/career-seed.ts` and `scripts/board-fill.mjs` both refuse to write
without an explicit flag, and both default to the harmless development keys
unless `VERCEL_ENV` says otherwise. Keep that shape for anything new: a script
that touches real players should have to be asked twice.

## Career passwords: the way back players keep

Players did not save their career keys, so a named player sets a password of
their own. The design is Figma section 13, "Career password · user journeys"
(node `303:9720`): five lanes, A to E, every screen coded (A5, D3a).

Nothing about a password is asked before the first ball: the name screen asks
for a name, a kit and a hand, and a new player's gate carries Played before?
top right (`#profile-played`) for a browser that forgot them. When it is asked
for is `src/game/password-nudge.ts`, in `tests/password-nudge.test.ts`:

- **My Stats**, from the first visit, for any named player with none: the Set
  a password card on every card of the rail, under the career card and above
  Road to Hitman (`passwordCardMarkup`, `place: 'stats'`). The career key is
  the last thing on the page.
- **The end of an innings**, once the career passes 50 runs, every mode added
  up (`NUDGE_RUNS`): the same card straight under the score card (and the
  Marathon's batting card), above the board's place and Career stats, with a
  solid orange CREATE A PASSWORD (`cta({ kind: 'solid' })`) so it is never
  taken for PLAY AGAIN. Survival's card is a screen of its own, so the card
  travels to it with the board's strip (`hostStrip`), first in it. Never on practice, a Rival Match, a demo or in a
  private window. The career key no longer stands on the end card at all.
- **The nudge sheet**, after three end cards walked past, then every five,
  never twice a visit (`sheetDue`, counted in `hitman-password-nudge`), and not
  over the stars or an unlock. No hard stop: a player can always bat.

Every way in opens the one sheet (`src/ui/Password.ts`, the `#password-overlay`
in the HUD): password and confirm with SHOW, the rules said live (`ruleStates`)
and again by the store, and an optional security question from eight
(`src/game/password-questions.ts`, kept by position: add on the end, never
reword). A hidden username field holds the name, so Safari and Chrome offer to
save it and the restore sheet's password field fills itself in. Your details,
from the edit key on My Stats, has the password row (`passwordRowMarkup`) that
opens it to change: a blank field keeps what is there.

The rules (`passwordProblem`, `src/server/password-rules.ts`): six or more
characters, not one character over and over, not the commonest few (123456,
abcdef, password, cricket123…), and not the player's name exactly, in any
case: Shashank is refused, Shashank123 is fine.

Kept against the player id (`${SCOPE}passwords`, and the question and its
answer in `${SCOPE}questions`), so every name they hold opens with it, as
salted scrypt hashes (`src/server/career-password.ts`). Answers fold capitals,
spaces and punctuation. Neither is sealed or ever read back. The store says
whether a player has one (`?status=1`, with the question's place) once a load,
after a claim and after a restore; until it answers nothing is asked, so an
outage never nags a player who has one.

Restoring (`src/ui/Restore.ts`): a few letters of the name list the players
with a password (`${SCOPE}findable`, `ZRANGE BYLEX`; a name, a kit and an
innings count, never an id), the player taps themselves and enters it. Forgot
password? beside the field asks the store for the player's question
(`?question=1`) and puts it (`answerSheetMarkup`); the right answer
(`?recover=1`, the same tries as a password and a key) asks for a new password
and brings them back. With no question, the career key is the way back
(`noQuestionMarkup`); brought back by a key with no password, Welcome back
offers one. A browser inside Instagram or Facebook is told its saved passwords
are out of reach there (`insideAnApp`). A restored id is written to all three
stores (`adoptPlayerId`): before it lived only in memory and was lost on the
next visit.

Every step is counted on GoatCounter (`restore-open-profile` is Played
before?, `password-created`, `restore-done-password`; the README's table has
them all), and what reaches the store is counted there too, exactly, by day
(`src/server/tally.ts`, raised in `api/restore.ts`, never failing the request).
`scripts/password-report.ts` prints those beside how many players hold a
password now; it is read-only. A new tally goes on the end of `TALLIES`.

`tests/password.test.ts` holds the store's rules; `scripts/password-check.mjs`
walks lanes A to E in a browser. The dev server's restore tries are real and
shared by every check, ten an hour: restart it between runs of the restore and
password checks.

## A friend who lost their career key

A key is kept as a slow hash, which a restore is checked against, and — for
every key issued since `KEY_SEAL_SECRET` was set — sealed as well, so the owner
can read it back. Two scripts, both run by the owner in their own terminal,
never reachable from the game (`src/server/key-admin.ts` is what they decide
with, in `tests/key-seal.test.ts`):

    VERCEL_ENV=production npx vite-node scripts/key-show.ts "Dhruv"
    VERCEL_ENV=production npx vite-node scripts/key-reset.ts "Dhruv" --write

`key-show` reads a sealed key back and writes nothing; a key issued before
sealing has only its hash, and it says so. `key-reset` gives one name a new key
and the old one stops opening it — nothing else is touched, not the record,
which is filed under the player id, and not anybody else's key. Without
`--write` it says who it found and stops; with it, it asks for the name again.
It also clears the tries already spent on that name, so the new key works at
once. Both print how many innings the player has, so the owner can be sure it
is the right one — and the owner has to be sure the person asking is that
player, because whoever is sent the key holds the career.

## Checks

`npx vitest run` and `npx tsc --noEmit -p .` cover most of it, but the card is
painted into a canvas and the sheets are wired by hand, so neither sees the
screen. Five scripts drive a real browser against a dev server and are what
catch those — `stats-check.mjs` for the card and its rail, `whatsnew-check.mjs`
for the stories, `end-card-check.mjs` for the end of an innings and the keys
that live only there, `career-count-check.mjs` for the rule that only a
finished innings counts toward a career, `restore-check.mjs` for what a player
with no name is offered and the screen that takes a key back, `key-check.mjs`
for what a player who has one is shown, `password-check.mjs` for the career
password's journeys.

`scripts/return-check.mjs` is the return ticket: the cookie `/api/me` sets so
that Safari, which deletes everything a page's script wrote after a week away,
still has something to bring the player back from. It wipes the browser the
way Safari does — localStorage, the script's cookie, IndexedDB — and expects
the same player back under the same name and kit, and `?fresh=1` to take the
ticket too. The page reads the ticket but must never write it: a cookie written
by script is one Safari caps at seven days, which would turn the one copy that
survives into another that does not. What no check can do is wait a week on a
real iPhone; the `identity-recovered` count on the dashboard is that test.

Those last two are split by whose screen it is, and that is the point. A check
that registers and then deletes its way back to nameless is testing its own
teardown: the key card was missing from My Stats for every registered player
and three browser checks walked past it, because all three reached that screen
by finishing an innings and none by opening the board from the cover. (Both
now reach My Stats by the cover's profile chip, the board having lost its My
Stats tab in the redraw.)

That last one holds a rule about *when* something happens rather than what a
function answers, so no unit test can reach it. A career is a sum, so an
innings walked out on counting would let a player stack runs by restarting
whenever the over went badly. There is one call that counts an innings and it
is in `end`. Keep it that way.

**Run the dev server with `VITE_SHOW_SURVIVE=1`.** Without it the build plays
one game, and a build with one card cannot draw a rail of three — the Blast,
and off production the Test Marathon, then Test Survival — so the whole
carousel goes unchecked while the checks report success. A carousel bug shipped
to a preview exactly that way.

    VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
    CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/end-card-check.mjs

The other two take the server's URL as their argument, so point them at the
same one rather than at their own defaults.

Reach the screen the way a player does. The checks that open the board from the
cover missed two bugs on the end card, because nothing had ever finished an
innings — which is how most players get to that card in the first place.

A check has to pass on a GPU as well as in software. Most were written against
software rendering, where the game runs in slow motion against the wall clock,
and some leaned on it without saying so: two Blasts written a second apart
were more than the store's ten seconds apart (`MIN_INNINGS_MS`), a flash put up
in the moment before a ball outlived the next ball's reset, a doodle was still
at its first frame when the grass under it was measured. On a machine with a
GPU the game keeps real time and each of those failed, on production as on the
branch. Wait on what the game says (`snapshot()`, its phase), not on how slow
the machine is; and a box measured off a screenshot is in the page's pixels,
so scale it by `devicePixelRatio`.

A check that seeds `hitman-whatsnew` seeds the current update key
(`player-profiles`), or the stories stand in front of Choose a mode.

`scripts/scene-check.mjs` is the ground itself: the sky and the painted turf
are canvases and a shader no unit test runs, and it holds the draw-call budget
a frame. Lower its `BUDGET` when a change brings the count down. It walks both
grounds — the stadium every mode plays in, and the bowl before it,
which `?ground=bowl` still builds and which is kept for that — and the stadium both by day and by night. The Blast follows the
device's clock — night from six in the evening to seven in the morning — so a
check that judges the ground's colours in a Blast innings without saying
which is judging whatever the machine's clock says; `?lights=day` or
`?lights=night` asks for one. Build new
scenery through `Batch` (`src/scene/build.ts`), one mesh a colour, not a box
at a time.

`scripts/milestone-check.mjs` is the fifty, the hundred, six sixes, and the
Test innings' marks after them — 150 with the raised bat and the sticker, and
the double, the triple and four hundred, each with a celebration and a doodle
of its own: the grey is measured off the pixels of the grass, and the doodles
are judged on their own clock, because a headless browser rendering the ground
in software can hold CSS animations at their first frame. The big three put a
layer up behind him and draw him back out over it (GameScene's `cutout`); the
check reads his outline off the cut-out canvas's own pixels, and takes all of
it in the one look at 650ms: in software the next look can land seconds later,
after a moment as short as 150's is already down. A moment is asked
for by name (`__cricket.milestone('triple')`); which ball earns it is
`milestoneOf`'s, in the unit tests.

`scripts/power-check.mjs` is the flash for a special stroke played on a full
meter: the ground greyed round the batter and the ball, focus lines running
out from him and off the screen, a burst either side of his boots, and the
call for the ball left in place. The charge and the sweep get it whenever
they find the bat and he is not out; the scoops only for six
(`landedSpecial`). All of it is drawn *behind* him: the doodle is the stage's
back layer and he is cut back out over it with his stumps and the ball
(`Cutout.ball`, GameScene's `cutout`), a thin line of the pen's ink round him.
Drawn over him, the bursts, dirt and sparks at his boots painted over the
stroke itself — a scoop is played from a squat and a reverse scoop from a
knee, and the ink landed on the shot. A scoop's flash is `low`
(`powerDoodle`'s last argument, `is-low` on the layer, `__cricket.power(style,
true)`): the bursts stand out from under the squat, wider apart and lower, so
the ramp reads against plain grey. The burst comes in five styles, each in its
own pen and dealt from a shuffled bag; the check puts each up by name
(`__cricket.power('flame')`), photographs it, and deals five to see all five.
A new style goes in `POWER_STYLES` and in the check's `PENS`. The grey runs on the game's
clock, so it is waited out by asking the game (`snapshot().muted`), not a
stopwatch. It also plays real balls on a hand-wound clock until a special
stroke lands, for the fire trail that burns behind only those
(`snapshot().burning`); that part takes several minutes in software.

`scripts/pull-check.mjs` is the flash for a bouncer pulled and hit, the one
ordinary stroke that gets one (the hook, the pull's other half, gets it too): focus lines in the pull's pen, a swoosh behind
the bat (`snapshot().swishing`) and the ball's tail recoloured
(`snapshot().tail`), with the ground left in colour. It raises it through the
debug hook, then plays real innings in both modes, blocking every ball until a
bouncer comes and pulling that one on time, so the rule that earns it is proved
to fire in play and not only on demand.

`scripts/nearing-check.mjs` is the wait for those moments: the card under
the score bar ten short of a fifty or a hundred and from the third six running.
It writes the innings out ball by ball through the debug hook with the real one
paused underneath, and slows the page's timers while it photographs a card on
its way off — software rendering can spend a card's whole exit between two
steps of a script.

`scripts/marathon-check.mjs` is Test Marathon, entered first by its card on
Select Mode (there off production only) and then twice by `?mode=marathon`: the
swipes card and the four rules cards a first Marathon opens with, the three that outline the
wickets, the Focus meter and the pause key and the one that marks the pitch, and nothing bowled until they are put away — it is
the only check that sees them, and it seeds `hitman-marathon-intro` past them
for the rest; then the batter
named as he walks out, the next one standing after the last was carried off,
the declare key from the twentieth over and not before, the card — the worm
with a ball for each man gone, the batting card, and CHANGE MODE and SHARE
under PLAY AGAIN — the speed gun, the Focus meter turning into confidence at
thirty balls, the Test match's
greener strip and its wear — a stage as the swing comes, another with the
express bowler — the swing's level banner, with the sky measured greyer off the
pixels as the cloud comes over, the express bowler arriving untold in the
eleventh over with his own action and the fast bowler's in the next, the left-hander — the ground mirrored while he is in and off again for
the man after him, his pull on the key to the right — round the wicket, by
the nets' link `?nets=1`: the bowler from the far side of the stumps, the ball out of his
hand out wide and angling in to reach the bat on its line, and the same
mirrored for the left-hander, against the first over's over the wicket; and
the nets' keys putting on the express bowler, the spinner and the other side
of the stumps from the next ball — and the end card
offering the boards' claim strip and sending nothing that was not claimed,
and the ended nets innings offering none — it is practice. Its career card is
`stats-check`'s, second on the rail and green. It writes most of
the innings through `__cricket.marathon` and bats the rest.

`scripts/shots-check.mjs` is how to hit, the coachmarks before a browser's
first innings (`src/ui/ShotsIntro.ts`), redrawn from the handover (Figma
128:4759 on): seven lanes of light fanned from the bat (`batterOnScreen`) —
the five up the ground and square, and two short ones down past the bat for
the late cut and the hook at a bouncer — lit
in turn in the game's colour with a thumb swiping each and the block a caption,
the strokes' names at their ends and the keys beside them on a keyboard, the
words on one card at the foot (SKIP and NEXT, BACK and LET'S BAT on the last);
then — where the scoreboard has a confidence meter — the meter outlined in a
hole cut in the scrim, with its name on a tag; nothing bowled until they are put away,
never a second time, and never for a browser that has batted here before
(`playedBefore`). A Test Survival shows the swipes alone and leaves the meter
for the first Blast. In a Test Marathon the swipes are the first of the rules
cards, drawn the other way round for a left-hander. Every other browser check seeds `hitman-shots-intro` past
it, so a new one that bats should too.

`scripts/pause-check.mjs` is the pause sheet, in the Blast and in a Test
Marathon: the chip naming the game in its colour, the score under the title,
the keys each game has and not the other's, and the two sound switches — the
crowd's cheers and groans, and the ambience under them — each flipping only
itself, kept across a reload (`hitman-crowd`, `hitman-ambience`), and the
murmur staying away once the innings goes on.

`scripts/rating-check.mjs` is the star prompt under the end card, and like
`career-count-check` its rule is about *when*: it finishes innings to prove the
first asks nothing, the second asks about its mode, and a third that visit asks
nothing, before putting the slip up by name (`__cricket.rating('marathon')`)
for the rest. The celebrations are judged by the pieces they leave and the
requests sent, not by frames. When to ask is `nextAsk` in `src/game/rating.ts`,
in the unit tests; a new mode goes in `NEW_MODES` and gets its follow-ups in
`FOLLOW_UPS`. `QUICK=1` skips the innings and checks only the slip, for a
renderer too slow to bat — it says nothing about when, which is the point of
the check, so it is not a substitute for the full run.

`scripts/name-check.mjs` is "Claim your name": a player with no name is asked
for one after any finished innings, not only one that earned a place, and the
name is claimed on its own through `/api/name` — nothing goes on a board, the
key comes back. It bats a Test innings of no runs, holds the form to the rules
for a new name (`nameProblem` in `src/server/name-rules.ts`, checked in the
browser before a round trip and again on the server), claims a made-up name,
and then from a second browser tries the same name with a number on it and is
pointed back at the one that is held: a name and its siblings — the same but
for a number on the end — are one person's for a day after the first is
claimed. Names already held are never put to the new rules again. Then it
edits the details from the head of My Stats: a player takes a new name once
every 30 days (`RENAME_WINDOW_MS`, kept per player in `${SCOPE}named`), going
back to a name they already hold is free and never released to anybody else,
the key they saved comes across to the new name (`carryKey`) rather than a
second one being minted, and the kit and batting hand change at once. Then
the gate before the first innings, for a new player and for one who already
has a name.

`scripts/dressing-check.mjs` is the Dressing Room (`src/ui/DressingRoom.ts`,
its stage `src/scene/DressingStage.ts`): reached by its card on Choose a mode,
under Rivals; the shelf's pictures drawn off the models, a locked kit tried on
with the key to the game it is won in, a kit and a bat put on, and the batter
then going out to bat in them (`snapshot().look`), or in OG Navy and Plain when
the pick is no longer earned. Boom is not free and nothing goes off on the way
in: it waits on the bat shelf (`WELCOME_BAT` and `ready` in `dressing.ts`), a
dot on the BAT tab and a light round its tile, until the player picks it and
presses UNLOCK BOOM, which plays its unlock over the room. It counts as
unlocked once `bat:boom` is in the seen list, so every player sets it off once.
What a career earned before the room arrived waits the same way: `seen` is
what is known to be earned (the end of an innings celebrates only what is not),
`shown` is what has had its moment, and anything seen and not shown — the
history a first look takes in quietly — waits in the room with a dot and its
own UNLOCK key (`waiting` on the record, `ready` in `dressing.ts`), and keeps
NEW on the card until it is claimed. A copy saved before `shown` existed reads
as having shown only Boom and the free pair (`cleanDressing`), so the players
who opened the room on its first day get their moments too. What is earned is worked out from the careers
every time (`dressing.ts`, in the unit tests), so history counts and nothing is
stored but the pick; the pick travels with a Rival Match innings, where each
player bats in their own kit now rather than their seat's. The shelf is a rail
down the right of the stage, not a row under it, so the pedestal has the
screen's height down to the foot; the camera fits the batter's crown to the
pedestal's front edge in that space, never nearer than the 874-high phone it
was drawn on, so a short phone gets the most it can and a tall one the design.
The room stands in a corridor of lockers (`src/assets/dressing/room.svg`),
baked into `room.webp` — lifted, softened and darkened by depth — by
`scripts/dressing-backdrop.mjs`; change the drawing and run it again. Only the
room has it (`new DressingStage({ room: true })`); the unlocks keep their rays.
A bat skin comes from the Figma template as four panels (`bat-<name>-face`,
`-edge-left`, `-back`, `-edge-right`); `scripts/bat-sheets.mjs <folder>
name=id …` packs them into the sheet the blade reads (`SKIN` in
`batGeometry.ts`), then the bat goes into `SHEETS` in `batSkins.ts`, `BATS`
and `batSteps` in `dressing.ts` and `BAT_IDS` in `dressing-ids.ts`, in its
place on the ladder: the shelf runs easiest to Hitman, which is always last.

A named player's Dressing Room follows them to another device: `/api/dressing`
keeps a copy per player id (one field in `${SCOPE}dressing`), which is what a
career key brings back. The browser sends its copy a moment after any change
and, once a load, after a restore and when a name is claimed, merges in the
store's (`mergeDressing` in `src/game/dressing-sync.ts`, the one rule both
sides use): the later pick whole, every unlock either has shown, the earlier
launch figures. A private window sends nothing. `scripts/dressing-sync-check.mjs`
plays two devices for one player against the dev server's store; it passes
`?private=0`, because headless Chromium looks like a private window and would
otherwise keep nothing.

The update's What's new is one story, the player profiles, as a Lottie film
(`public/lotties/player-profiles.json`, `Story.film`): a Blast board and a tap
on Kabir's row, his face lifting out of it into his profile, CHASE THEIR 157
pressed, the runs rolling up past it like an odometer and PASSED slammed down
with his name under a wave of paper, then Kabir's own My profile, his place
rolling from #2 to #3 on Rank down, and WIN IT BACK. The scenes change under
the game's chevrons rushing up the screen, Level Up's move. Scores stay in the
150s. It plays down the sheet on the page's black with the one way out under
it, holds a beat past its ten seconds and moves on by itself out of the stories. It is
drawn in code, every shape and word a vector from the game's own faces, with
the five board faces its only pictures. What writes it is not committed, as
the Dressing Room film's was not: `wip/profiles-film/build.mjs` on the machine
that made it (assembled from its `head.part`, the Dressing Room film's helpers
and `scenes.part`), held to Lottie's rules by `wip/dressing-film/lint.mjs`,
with `stills.mjs` to photograph any frame. The update key is `player-profiles`, so
everybody is shown it twice and then never (`whatsNewDue`); the strokes'
launch week and its once a day went with their cards. `whatsnew-check` walks
it: the film drawn above the way out, its hold, the twice and the never, and
the board's key that opens it for ever.

The other ways a story is told are kept for the next update, and the unit
tests hold them on made-up stories. A new stroke is filmed in the game
itself (`src/game/ShotReel.ts`, `Story.reel`): the game's own ground and
renderer, the player's own batter in their kit and hand, the bowler running in
and bowling the ball the stroke answers through the scene's own calls, the
stroke played to it in time, and what it comes to asked of `resolveShot` — the
six and the four are the rules' answers, not a script's. Only the camera
(`reelCamera`, through `GameScene.cinematic`) and the clock (`reelPace`, slowed
through contact) are the film's: the game's view from behind him as the bowler
runs, a cut in to the stroke side on from the off side, and the camera turning
after the ball. The card is the whole screen edge to edge and see-through, and
everything else on the ground is put out of sight while it plays (`reel-on` on
`#viewport`). On the frame before the bat comes down the film holds (`CUE`,
the game's clock stopped dead through `timeScale`), a shade comes over the
whole screen with the swipe that plays the stroke drawn big on it — an arrow
and a thumb run down it twice, or the key on a keyboard — then it fades and the
film goes on from that frame (`shotCueMarkup`, `is-cueing` on the sheet). What
it went for is stamped over him as the ball is met (`shotCallMarkup`,
`is-hit`), both drawn the way round the game draws them for the player's hand,
and the card's name is the display face in gold, slammed in. A card holds for
one go of its film, the hold for the swipe with it (`reelSeconds`). Nothing is scored, counted or sent, and the innings's state is
never touched, which is why it films only off the cover or after an innings
(`playReel`); opened from the board mid-innings, the card's words stand on its
own dark.

A story on the room's stage plays full screen
(`src/ui/StoryStage.ts`, `Story.stage`): every kit on the batter, then every
bat on the stand, with the title over the top, the words over the foot, and
the batter framed into the room left between them (`#whatsnew-room`), allowed
nearer than the Dressing Room's camera (`NEARER`). It is the shelves'
catalogue, so a kit or bat added later is in the stories without a new picture,
and there is no picture to download. Each line under them is two lines at
most and counts nothing — the shelves only grow — and both cards end on a
short blue SKIP beside GO TO DRESSING ROOM. Only the last holds still
(`storyHolds`): the first moves on as any story does, its keys standing where
the next card's are. The stage is warmed on the cover only when an update
has a story on it (`warmStories`). Every frame of it is a 3D render, seconds
apiece in software, so a check that walks it on a wound clock refuses the
stage's module until the moment it means to watch it play.

## The year recap: kept now for December

A recap of each player's year is planned for December, and it can only tell
what was kept as it happened. Every innings `/api/innings` counts toward a
career — only when it counts it (`counted`), so a repeat never doubles — is
also folded into the player's record for its year and into the year's
totals (`src/game/recap.ts`, `src/server/recap-store.ts`): innings, runs,
balls, fours, sixes, best, fifties and hundreds a mode, Survival wins, the
innings in each kit and with each bat (the look travels with the innings and
is checked against the shelves, `lookOf`), the innings on each day and in each
hour, and the first and last. A Dressing Room save that brings in a piece the
store did not hold dates it (`won` from `saveDressing`), and counts it among
everybody who won it; the free kit and bat are never won. Days, hours and the
year are India's time, and the server's clock, never a browser's. One field a
player in `${SCOPE}recap:<year>`, the year's counters in
`${SCOPE}recap:<year>:all`, raised in place. Neither ever fails the innings or
the save it rides on. The dev server answers `GET /api/recap?player=` from
memory for the checks; nothing deployed reads it yet — the recap itself will.
`scripts/recap-check.mjs` finishes an innings and unlocks Boom and reads both
back.

GoatCounter counts the same things across everybody, by name (it keeps the
path, not the title, so the item is in the name): `dressing-open-modes` and
`-story`, `dressing-wear-<kit|bat>-<id>`, `dressing-unlock-…` and
`dressing-claim-…`, `dressing-play-<mode>` from a goal's key, and
`whatsnew-open-<card>` for GO TO DRESSING ROOM, apart from the stories' read
and left counts. They go through `dressingMark`, not `mark`, so the last mode
played does not split them, and the `?dressing=1` preview counts nothing.

## The guard: gloves and pads

The batter's gloves and leg pads are one pick, a guard: eight colourways in
`src/entities/gloves.ts`, their ids in `dressing-ids.ts` beside the kits' and
bats' (`GUARD_IDS`). Sterling is the one he is built wearing (`FREE_GUARD`,
white and silver so it goes with every kit and the Test match's whites); the
rest are Glacier, Fern, Evergreen (Fern in British Racing Green), Ember (the
carbon weave with red pads trimmed black; its id is still `carbon`, which
saved picks and the checks hold), Blaze, Midnight and Volt (Electric's blue with a volt-yellow accent). Each design is the
gloves in full and the pads' two colours (`pads.body`, `pads.trim`: the pad,
and its piping, knee roll and ankle flap), and `Batter.wearGloves(design)`
puts both on, the straps round the back of each pad in the darker of its two
colours (black on Ember, navy on Midnight, silver on Sterling); the kits no
longer colour the pads or their straps (`Outfit.pads` is kept in the
catalogue and read by nothing). The guard is the Dressing Room's third shelf
(GUARD, `shelf: 'guard'`), and nothing on it is earned: every one is free to
wear, so the shelf has no locks, no dot and no Next up, and the room's "N of
20 earned" counts none of them. The pick is kept with the kit and bat
(`guard` in `SavedDressing`), travels and merges with them (the later pick
wins whole), goes with a Rival Match innings in `Look`, and is counted in the
year recap (`guard` beside `kits` and `bats`); a copy or a look from before
there were guards wears the free one. The stage's guard view (`StageView`
`'guard'`) is the batter whole, framed nearer than the kit's — his helmet to
his shoes rather than to the pedestal's edge, the headroom given up, and
allowed `GUARD_NEARER` closer than the kit's nearest on a tall phone — held
facing the camera as the bowler sees him so the backs of both gloves show
over the pads against the kit; the shelf's pictures are him from the gloves
down to his shoes in each, from the same side, so both gloves and both pads
show (his hands on the handle alone, near to, cropped the pads to a corner). The pads are built anew on every pick, as the gloves are, not
recoloured in place: an update to a buffer already on the GPU was lost on an
iPhone and kept the pads in the guard before. `snapshot().look` is
`kit/bat/guard`. `dressing-check` walks the shelf and bats in the guard it
put on.

The grip is a right-hander's from a photograph: the top hand's knuckles on the
bat's curved back with its fingers curling onto the face, the bottom hand's
the other way, both round the same edge, both thumbs down the handle; and each
fist is turned on the handle to face where its forearm comes off in the guard
(`WRIST_HOME`), which puts the back of the top hand to the bowler and the
bottom hand's to the ground, and is then fixed to the handle through every
stroke. The arm rig places the forearms from the shoulders and in the
follow-throughs they come off a side a wrist could not reach; that was
measured, judged invisible at speed, and left alone. Every piece of a glove's
colour is baked into its vertices, so a fist merges into one mesh and a pair
costs six draw calls, and a pad with its two colours stays one mesh: the lot
costs nothing over the old glove, and `scene-check`'s `BUDGET` says what its
figure means. Under the floodlights they keep the day's glow, none: the
night's glow is a material's own colour, and theirs is white. `gloves.html` shows every pair on the handle and on him
in five poses; `cover-drive.html` has every stroke with a Gloves row, and
`?gloves=<id>` picks the first. Both build into one file with their
`scripts/*-artifact.mjs`.

## Papaya, and the fielding side's kit

Two kits come free (`FREE_OUTFITS` in `dressing-ids.ts`): OG Navy, the one
he is built in, and Papaya, orange with white trousers, second on the kit
shelf. A free kit is never won and never celebrated: it is left out of the
innings-end unlocks (`freshUnlocks`), the room's waiting list, the recap's
`won` dates and the `?dressing=1` preview, and `cleanDressing` reads it as
already shown. Add a free kit to `FREE_OUTFITS` and to `outfitSteps`'s
`null` case, or an old record celebrates it as an unlock.

The bowler and the fielders wear one of the Dressing Room's kits, drawn at
random every time the batter is dressed for an innings and never the one he
is wearing (`pickSide` in `GameScene.ts`, `snapshot().fieldingKit`). They
used to wear the game's orange whatever he had on, which put a Papaya batter
in the same shirt as the men fielding against him. In a Test both sides are
in whites, as before.

## Who's batting: the gate before the first innings

Before the first innings in a browser — a new player's or an old one's — the
game asks for a name, a kit and the hand they bat with (`src/ui/Profile.ts`,
`saveProfile` in `src/Game.ts`), with no way past but answering. An old
player's are filled in and carry on in one tap. The name is claimed through
`/api/name` either way, which is also what claims a name typed into a Rivals
sheet, which until then lived only in the browser. It is asked once
(`hitman-profile`); after that the same sheet opens from the edit key at the
head of My Stats. If the board cannot be reached the gate opens anyway — a
player is never held at the crease for an outage — and asks again next time. A
private window keeps the name in the browser and sends nothing.

The gate has a back key (`#profile-leave`) and it goes to the cover, letting
the innings it was asked for go: there is no playing without a name. From My
Stats the same screen's back key is `#profile-close` and goes back there.

The hand (`hitman-hand`) is the batter in the Blast and Test Survival; in the
Test Marathon one of the three bats the other way round from the player
(`leftHandersOf`), so a left-hander's side has two left-handers, and the board
takes up to two.

A player with a name has nothing to press at the end of an innings: a place
earned is posted by itself (`autoPost` in `src/Game.ts`, once an innings) and
the card says where it landed, with the board one tap away. Only a player with no name, a private
window, practice and a Rival Match keep the old offers — and a post that fails
falls back to the register key, so nothing is lost to an outage.

Every other finished innings by a named player is posted too (`quietPost`), so the store can say where they stand
however far below the fifty: the ranking sorted sets have never been trimmed,
so a place is one `ZREVRANK` away. `/api/score` answers each post with
`standing` — the place now, out of how many, and the place before (`was`) —
and `GET /api/board?player=<id>` answers it for a player who has not just
batted, uncached, beside the fifty that stay the same for everybody. The card
goes by that answer, not by the board on screen, so it does not matter which
arrives first; until it answers, the card says the innings is going up. One post an
innings whichever way it is asked for (`postOnce`). An innings is two hits on
the address's counter now — the post and the career count — so `RATE_LIMIT`
is 240. The redrawn end card draws the place (`placeNow`), and it is in
`snapshot().standing` for the checks.

`scripts/post-check.mjs` walks that in about a minute: a Test Marathon
written ball by ball and bowled out, for a named left-handed player — posted
once, by itself, with two left-handers in the side and the store taking it,
the card saying where it landed — then a named player's duck against a board
filled to fifty, posted once and placed last on the whole board, the card
saying that place, and asked again through `?player=` — and for a player with no
name, for whom nothing is sent and the card still asks. `board-check.mjs` holds
the same places to a real deployment, where the Redis adapter's pipeline runs.

**`?debug=1` skips the gate**, because every browser check drives that link and
each would otherwise have to answer it. `?profile=1` asks it there anyway, and
`name-check.mjs` is the check that does.

`scripts/board-check.mjs` needs a live database and is the one path the others
cannot reach. It walks all three boards, the Marathon's two ladders from one
post among them, and the Marathon's career runs ladder. Point it at a preview deployment, never at production.

## Desktop is the phone, in a column

On a desktop — a fine pointer and a window wider than 3:4 — the game is the
phone's game in a 9:16 column the full height of the window, with a note
beside it (`.desk-note` in `index.html`): made for your phone, a QR code for
`hitmancricket.in`, and the keys for whoever bats on here. The keyboard still
plays every shot. There is one layout: the viewport units in `styles.css` are
container units (`cqw`, `cqh`) and the size rules are `@container app` queries,
so everything measures `#app` rather than the window and the column lays out
exactly as a phone that wide does. Write new sizes the same way — a `vw` or a
`@media (max-width…)` measures the desktop window, not the game. Touch still
decides the hints (swipe or keys); it no longer decides the layout, and the
cover is the phone's cover everywhere.

## The move to hitmancricket.in

`hitman-cricket.vercel.app` hands each visitor to `hitmancricket.in` with their
player packed into the link's fragment, because a browser's storage does not
follow a redirect. It is switched on by `VITE_HOME_ORIGIN` and only ever moves
that one host. Leave the old address serving the page — a server-side redirect
in Vercel's Domains list would strand everybody — until `docs/LAUNCH.md` says
otherwise. `scripts/move-check.mjs` walks the hop; its server needs
`VITE_HOME_ORIGIN=https://hitmancricket.in`.

## `?fresh=1`

Clears what this browser remembers — the player id, the name, the career key,
every `hitman-` key, the cookie and the IndexedDB copy — and it asks first.
The question is the feature: a link is a thing people send each other, and one
that wiped a career on sight would be a prank with a cost. Keeping is the drawn
key and clearing the outlined one, which is the wrong way round for whoever
typed the flag and the right way round for whoever was sent it.

It exists because there was no honest way to test the thing the career key is
for. Identity is kept in three places so that losing one does not cost a record,
and the same belt and braces made "look at this as a new player" a trip through
the browser's settings. A private window is no use either — the game refuses to
count an innings in one, so the path being tested is shut before it starts.

The board is untouched: the name stays claimed and a saved key still opens it.
`scripts/fresh-check.mjs` walks both answers.

## `?demo=1`

Fills the boards with fifty made-up players, in the browser that asked, saving
nothing — the Marathon's two ladders and the Rivals ranking too. It is how a full board gets looked at without claiming fifty real
names. `?demo=0` or a new tab turns it off.

## The preview filler

Off production — every preview and the dev server — the Test Marathon's two
ladders and the Rivals ranking carry made-up rows among the real ones
(`fillMarathon` and `fillRivals` in `src/game/demo-board.ts`, switched by
`PREVIEW_FILL` in `src/Game.ts`), because nobody has played the new boards on
a fresh preview and an empty board says nothing. Real rows take their true
places among them and are never pushed off a full board; the Marathon card's
offer is worked out against the same filled board, so the place it names is
the place the board shows. Nothing is written. Production never sees them.

## Practice: the test switches stay off the boards

An innings played from a link carrying a switch that changes the game —
`?nets=1`, `?settled=1`, `?swing=1`, `?express=1`, `?reverse=1`, `?round=1`,
`?wear=fast`, `?spin=1`, `?charge=…`, `?slowmo=…`, `?bouncers=1`, `?hooks=1`
(every ball a bouncer on off stump or wider, the hook's ball), `?spincut=1`
(every ball the spinner's, for the cut off him), `?spinpull=1` (every ball
the spinner's and all but the arm ball dropped short, for the pull off him),
`?latecut=1` (every ball
pace outside off, for the late cut), `?cover=1`
(every ball the cover drive's own: a stock ball pitched up on off stump),
`?coverv=1`, `2` or `3` (always that version of the cover strokes),
`?flickv=1` or `2` (always that version of the flick), or the
preview builds' `VITE_SPIN_ONLY` and `VITE_CHARGE_ONLY` — is practice
(`src/game/practice.ts`). The card says so in place of an offer, the career
does not count it, and the browser's own best does not move; in a Rival Match
the switches do nothing. A new switch goes into `PRACTICE_SWITCHES` or into
the named exceptions in `tests/practice.test.ts`, which fails on any
parameter the game reads that is in neither.

## Three versions of the cover strokes

The strokes off the cover swipe come in three versions (`CoverVersion` in
`src/entities/Batter.ts`), and the game picks one at each cover swipe, four
in ten, two in ten and four in ten (`COVER_ODDS`, `coverVersionOf`): version
one is the cover drive as it always was (`COVER_DRIVE_V1`); version two the
cover drive rebuilt from a side-on slow-motion recording
(`STROKES.COVER_LONG_OFF`, the front foot planted first and a long lunge,
`COVER_PLANT`, home back along the swing, `COVER_HOME`); version three version
two's drive met beside the front pad rather than out in front of it
(`COVER_DRIVE_V3`, `COVER_V3_MEETS_AT` further down the pitch), the hips,
chest and hands carried forward over the planted foot and the ball resolved at
that point of its flight (`meetsAt` in `src/Game.ts`, the scene's `meeting`).
Its square drive is version two's. The charge over cover is one stroke in every
version: from the ball the face rides the handle (`riding`), with no wrist roll
(version one's turned the bat in his hands, more than a full turn by the time
it was home), and the hands lift the bat level to a finish just above the
helmet, the toe up the pitch over extra cover and the head left over to the off
side (`COVER_CHARGE_KEYS`, rebuilt from a net clip from the bowler's end; the
first build stood the bat on end over the off shoulder). The batter tests hold
it level from the extension to the hold and hold the face from turning in his
hands in both versions.

Versions two and three keep the ball down: middled, the drive goes along the
ground for four, never over the top for six (`grounded` on the attempt, read
by `resolveShot` and `resolveSurvive`), and skied and not caught it lands
inside the rope and runs away for four (`flightOf`); version one's still goes
for six either way. The
swipe is judged the same in all three — the version is drawn after it, so
nobody can time for it — and since the version now moves the score it is
rolled off the innings' seed and the ball it has reached (`coverRoll`), never
taken from the seed's own stream, which would move every ball after it: the
same ball plays the same version for everybody on that seed, rivals
included. `?coverv=1`, `2` or `3` asks for one, and is practice. `cover-drive.html` is both strokes in every
version on their own, built into one page by
`scripts/cover-drive-artifact.mjs`.

## The on drive

The on drive (`STROKES.LONG_ON`) is the straight drive played to long-on:
every key is the straight drive's turned 24 degrees about his back foot, so the
front foot strides down the line of a ball on leg stump towards mid-on, the bat
comes down straight with its face closed to mid-on, the arms go out along the
line, and the hands finish high with the blade up the ground. Turned as one,
the arms keep the straight drive's relations to the trunk, which is what the
shared arm checks hold. It meets the ball beside the front pad, 16cm further
down the pitch than the straight drive (`ON_DRIVE_MEETS_AT`, lofted or along
the ground, judged the same as the swipe always was), and goes home back down
its own swing as the rebuilt cover drive does (`rebuiltDrive`), without its
carry, so the bat never turns in his hands. It used to whip the bat across his
front and over the leg-side shoulder, a flick's finish, turning the blade more
than once round in his hands; nothing tested it, because it was the one drive
missing from the batter tests' list of strokes (`'on'` in `PLAYS` now).

Its six (`ON_LOFT`, played when the swipe is perfectly timed) shares its
stride and contact, climbs through the lofted straight drive's extension and
carry turned the same way, and wraps: the hands just over the front shoulder,
the elbows bent, the bat lying back over the shoulder behind his head, held,
then home back over his head and down the line on a clock of its own
(`ON_LOFT_CLOCK`). The arms take the bat over, not the wrists: from the ball the
face rides the handle (`riding`), and the one turn it takes is the bottom hand
rolling over the top one through the carry (`ON_LOFT_ROLL`), evenly and one way,
so that at the wrap the flat face looks away from the front shoulder and the
curved back of the blade lies against it; nothing turns it while it is held,
and it settles into the guard on the way home. The six it replaced reached
both arms for the sky and turned the bat a full turn in his hands coming home. `cover-drive.html` has both beside the cover strokes.

## The straight six, version two

The lofted straight drive comes in two versions, three in ten and seven in ten
(`LOFT_ODDS`, `loftVersionOf` off the innings' seed and the ball, mixed apart
from the cover strokes' roll), and both are the same six: only the picture
changes. Version one (`STRAIGHT_LOFT`) is the finish over the front shoulder it
always was. Version two (`STRAIGHT_LOFT_V2`, its clock `LOFT_V2_CLOCK`) is
built from Kohli's six over the bowler's head at Adelaide, side on and from
behind the bowler: a long stride, the front foot planted before the bat
arrives with the head over the knee and the back foot left behind; a straight
bat under his eyes; the arms out long up the line, and the stroke ends there
(`LOFT_V2_CLOCK.finish`): the hands high in front of him over the front
shoulder and clear of his face, the back arm crossing under his chin, the toe
up over the bowler, with no wrap over the shoulder or behind the head. Leaning
his head off towards the back shoulder put that arm through the grille; the
helmet check in the batter tests measures from the head's centre and missed
it, so the grille was measured on its own while the pose was set. He
holds that a long while, low on the bent front leg with the back foot on its
toe, then brings the bat home down the line into his guard. The face
rides the handle from the ball (`riding`). The swing's version argument is the
cover strokes' for them and the loft's for this (`Game.shoot`); `?loftv=1` or
`2` asks for one, and is not practice, since the six is the same. It is
`loftedV2` in the batter tests' `PLAYS` (`lofted` is version one), and
`cover-drive.html` has it as Straight six.

## The hook

The hook (`'HOOK'`, `STROKES.HOOK` in `src/entities/Batter.ts`) is a bouncer on
off stump or wider (`hookable`, `HOOK.lines`) hooked round to fine leg, built
from Tendulkar's off Caddick in 2003, end on in slow motion. It is an ordinary
stroke, no meter, and the ball's line picks it, not the thumb: at a bouncer
any leg-side swipe or key — left, down and to leg, A, or S and A — is the
hook when the ball finishes on off stump or wider and the pull anywhere else
(`playedAs`; `mapSwipe` reads the whole leg side under the on drive as the
hook while such a ball is on its way, the input's `hooks`, and S waits for
its partner key there as it does with a meter). Asked for by a narrow
diagonal, the hook came out a third of the time: at a bouncer on the body
there was none, and down-left sat on the line between the pull and the
block. A hook at any other ball is the block. Down and to off is still the
cut, the late cut and the block.

He goes back and across first (`HOOK_LOAD_MS`), the back foot over towards
off stump and the front one drawn back and opened, the bat high over the back
shoulder; the hands come down and out, and the ball is met well away from
him at `HOOK_CONTACT_MS` — out in front by `HOOK_MEETS_AT` and towards off,
both arms straight, the bat level, the face to the bowler. Then the arms swing
it round flat like a baseball bat, still long: out in front, out to leg, round
behind square, the chest turning with them. Only then do the elbows fold and
the bat wraps behind his head, the hands over the front shoulder. The face
rides the handle from his stance (`riding`) and never turns in his hands but
twice, a little at a time: the forearms squaring it to the bowler on the way
down, and the bottom hand rolling over the top one as the elbows fold, so the
curved back of the blade lies against the front shoulder at the wrap, as the
on drive's six's does. The first build held the hands at his chest and turned
the bat on its handle, and was redone from a net session filmed end on. After
the wrap he turns on, as the clip does, on his feet as well as his shoulders:
the hands staying up over the front shoulder while the body turns under them,
square to the leg side and on round until his back is to the bowler and his
hips to the stumps, the front foot lifted and brought round on its toe to off
stump (`toe`, `frontFootYaw`) and the back one pivoted to leg stump, the two
the other way round from where he hit it, and the bat up behind his head
pointing away to off. It is one turn with the swing, not a second movement
after it: from the ball on the keys are carried round about his hips
(`HOOK_SWUNG`, `swungRound`) onto one turn that is fastest through the ball and
slows all the way to a stop, and they are one key list, which eases to rest
only at its end. Turned as first authored, the body slowed into the wrap, the
list stopped there, and the turn after it ran nearly three times as fast, in
slow motion besides — the batter tests hold the turn to slowing once it peaks.
Turned that far, a knee bent out to off as every other stroke's is folds
backwards, so the hook's knees bend the way he faces. Held there, he unwinds with the bat brought upright
over his head and lets the hands down into his guard, whose bat is up behind
him already. Taking the hands round behind his head instead, or home back
through the wrap, put an arm through the helmet. Once he has turned round, the
hold and home run `HOOK_HOLD_MS` slower than the other strokes' clock, as an
admired drive holds its finish the longer, so the way home is not hurried; the
swing and the turn keep the stroke's own tempo. A hook that scores is
twirled after, as a pull is (`played.pulled`). It shares the
pull's elbow clearance (`crossBat`) and is in the batter tests' `PLAYS` as
`hook`.

Met out in front, a ball sent to fine leg goes back across where he stands,
so a hooked ball (`hooked` on the outcome) climbs from the bat in `flightOf`
whatever it is worth, and `tests/flight.test.ts` flies it against his head
and chest: the first build sent a hooked four on along the ground through
his shoulder.

Timing names it (`hooked` in `ShotResolver.ts`, the cut's ladder): middled
six over backward square leg (`SHOT_ANGLES.HOOK`, out across the front of him
the way the bat swings: sent finer it went back over his head towards the
camera while the bat was still going the other way), a shade under four, held back ones and
twos; worse and the side decides — late the glove through to the keeper,
early straight up off the top edge and caught. Missed, it flies on over the
stumps. Survival and the Marathon pay it the same way off their own windows,
early skied and late gloved or hurt. A hooked six, and only a six, gets the
pull's flash (`pulledBouncer`). `?hooks=1` bowls nothing but its ball, every
ball, in any mode (`bouncersEvery`), and is practice. `scripts/hook-check.mjs`
plays it in a browser on `?bouncers=1`, keys and a real swipe, in the Blast
and in Survival;
`cover-drive.html` has it beside the drives.

## The pull

The pull (`this.pulling`: the leg-side input at a ball met above
`PULL_HEIGHT`) comes in two versions (`PullVersion`), each played half the
time (`PULL_ODDS`, `pullVersionOf` off the innings' seed and the ball, mixed
apart from the cover strokes' and the loft's rolls), both scored the same;
`?pullv=1` or `2` asks for one and is not practice. The swing's version
argument is the pull's for the leg-side input (`Game.shoot`). Both were built
from a net session filmed from the bowler's end, square on the off side and
close on the arms.

Version two (`PULL`, `PULL_SWUNG`, `pullV2`) is the hook's stroke at a ball on
the body: it runs the hook's branch and clock (`turning` in `Batter.ts`,
`HOOK_CLOCK`, `HOOK_HOLD_MS`). Back and across with the bat high, square to
the bowler; the ball met `PULL_MEETS_AT` out in front of him (`meetsAt` in
`src/Game.ts`, `pulled`, decided off the ball's height there so the game and
the batter agree on which stroke it is), both arms long and the flat face to
the bowler; swung round flat, out in front and out to leg, then wrapped behind
his head with the curved back of the blade on the front shoulder, and turned
on round until his back is to the bowler. Its round key keeps the hands out
wider than the hook's, which brought the back elbow within a forearm of the
handle, and its last key lets the hands down further out, which the hook's way
home took past the side of his helmet.

Version one (`PULL_V1`, `PULL_V1_CLOCK`) keeps the first build's body, side on
and opening only as far as square, and its clock, met beside him at
`PULL_V1_CONTACT_MS`, with the bat swung as version two's is: up high, down in
front of his chest (`down`: from the backlift straight to a ball on leg stump
the hands crossed in front of his face), level at the ball with the face to
the bowler and the hands out in front, round flat out to leg with the back arm
long, and wrapped over the front shoulder with the back of the blade on it.
No turn: he holds it standing where he hit it, `PULL_V1_HOLD_MS` past the
stroke's own clock, and comes home at its own pace. Its body follows the ball
across all the way, as the slog sweep's does: by the drives' share a ball
outside leg was met with the hands across his chest. The first build met the
ball with the face to square leg and the hands at his chest, from a backlift
at his hip, and stopped with the bat upright beside his shoulder.

They are `pull` and `pullV1` in the batter tests' `PLAYS`, and
`cover-drive.html` has both.

## The flick, version two

The leg-side input at a ball below pull height is the flick. Pitched up, it is in two versions
(`FlickVersion`), half and half (`FLICK_ODDS`, `flickVersionOf` off the
innings' seed and the ball, mixed apart from the other strokes' rolls). The
swing's version argument is the flick's for it (`flicking` in `Game.shoot`,
`flickV2` in `Batter.ts`), and since the default version is two, every test
that swings `LEG` at a full ball without one gets version two. Version one is
the flick as it always was (`STROKES.LEG`, the old default branch of
`update`), scored as every other stroke.

Version two (`FLICK_V2`, `FLICK_CLOCK`) is built from a coaching film in four
angles: a stride straight down the line, the body following the ball across
all the way, the front foot down first (`plant`) and the head over the knee;
the bat down straight to meet the ball beside the front pad, `FLICK_MEETS_AT`
further down the pitch than a drive (`meetsAt`), the face to the bowler. The
face rides the handle (`riding`) with one roll, the bottom hand over the top,
closing the face as the bat goes out low to midwicket (`through`); then it
comes up and stops (`up`), the bat upright in front of him and the hands out
ahead of his chest, below his chin, nothing turning it. Taken on over the
front shoulder into a wrap, the bat went into the shoulder and the bottom hand
into the grille, which the batter tests' helmet check, measured from the
head's centre, did not see; the shape test in `describe('the flick, version
two')` holds the hands out in front of his face and under the chin. He holds it
`FLICK_HOLD_MS` past the stroke's clock, still bent over, and comes home as
the hook does, stood up with the hands over the front shoulder and the bat
upright (`FLICK_UNWRAP`), then down in front with the bat tipping back over
the back shoulder (`FLICK_LOWERED`). Taken home bent over, by any route, the
blade went through his head.

It is scored on its own ladder in every mode (`flicked` in `ShotResolver.ts`,
`FLICK` in `gameplay.ts`, the attempt tagged `flicked`): middled or a shade
under four along the ground, held back or mistimed one, two or three (two at
most in a Test) or chipped up and caught, `ok.caught` and `poor.caught`; across
a ball it does not suit (under `SOLID_SHOT`) as good as mistimed; never six.
Missed, or under `FLICK.minFit`, he is beaten as any stroke is. Since the
version moves the score, `?flickv=1` or `2` is practice. It is `flick2` in the
batter tests' `PLAYS` and shared checks, with `describe('the flick, version
two')`; `tests/flick.test.ts` holds the scoring; `scripts/flick-check.mjs`
plays it in a browser on `?flickv=2`, in the Blast and in Survival; and
`cover-drive.html` has every version (`?stroke=flick2` opens on it).

## The flick, version three: off the back foot

A ball short of a length, one that reaches him above `DEFENCE_BACK_HEIGHT`
and no higher than `PULL_HEIGHT` (back of a length, at the thigh), is flicked
off the back foot whatever the roll says (`flickBackFoot`, `flickVersion` in
`Game.shoot`): a stride down the pitch is the wrong stroke at a ball rising to
the thigh. The length picks it, as it picks the two defences, so `?flickv=`
does not reach it; a bouncer is still pulled, and a ball pitched up keeps
versions one and two. The game sends version three to the swing; the batter
plays `FLICK_V3` for it (`flickV3`) and never pulls it, though a ball still
climbing can be over pull height where he meets it.

Built from a net clip filmed from the bowler's end (`FLICK_V3`,
`FLICK_V3_CLOCK`): back and across towards off stump with the bat up
(`load`), the front foot drawn back beside the back one, so at the ball the
feet are side by side across the crease and the hips and chest open to the
bowler, tall on the back leg; the bat straight down, the top elbow up
(`wristFlick` shares v2's elbow and riding), meeting the ball late at
`FLICK_V3_CONTACT_MS`, `FLICK_V3_MEETS_AT`, just in front of the front pad
and under his eyes, the flat face turned to square leg. Then the hands lift the bat straight up (`lift`), the toe
tips over to the off side until it lies across the front of his helmet
(`across`), and on up to stand diagonally in front of it (`finish`), the toe
up over the back shoulder; held `FLICK_V3_HOLD_MS` past the stroke's clock,
the front heel up, and home. The face rides the handle: to square leg at the
ball, then back to the bowler by `lift` and kept there at every key, so to the
finish the flat face looks at the bowler and the curved back at his helmet. The hands are carried out in
front through the tip-over: closer, the blade went through the back elbow.
Scored as version two is (`flicked`, `FLICK`): four at the most. It is
`flick3` in the batter tests' `PLAYS` and shared checks, with
`describe('the flick, version three')`; `tests/flick.test.ts` holds the
length rule; `cover-drive.html` has it (`?stroke=flick3`).

## Alive in his guard

Between balls the batter is not a statue (`WAGGLE`, `TAP`, `TAPPED` and
`lively` in `src/entities/Batter.ts`), built from a net clip filmed from in
front on the off side. In his raised stance he rocks the bat up and down from
the wrists, the toe tipping about ten degrees either way about the hands while
the hands hardly move, its rhythm drawn afresh each wait (`idleRandom`); and
his body goes with it a little (`STIRS`), so it is not the wrists alone: the
knees give with each rock, the weight rolls back and forward between his feet
every few rocks with the shoulders turning a couple of degrees, and his head
stays on the bowler, its turn being the world's. Before more than half the
balls (`TAP.share`) he lets the bat down until its toe is
on the turf behind his back foot, sinking a little over it with the hands by
his knees, taps it twice, and lifts it back through level into the guard; a
long wait, before an innings's first ball, has him tap again every four
seconds or so. A wait begins when he is back in his guard after a stroke, a
celebration or what he does after the ball. The bowler waits for a tap he has
begun (`tapping`, `batterTapping` on the scene, `TAP_WAIT_MS` in
`src/Game.ts`), as a bowler waits for a batter to settle: cut short by the
run-up it was a dip of the bat and back. That holds him back a tenth of a
second or so on those balls, and never more than `TAP_WAIT_MS` past
`readyMs`. A tap is never begun once the bowler has set off (`runup`, which
the scene says every frame of the run-up and flight), and the waggle has
faded by two-thirds of the run-up, so he is still for the delivery stride and
every stroke starts from the guard it always did; the timing windows are
untouched. What `prepare` leaves after a ball is not read once he has played
at it: it held him still for every wait that followed a stroke, and only the
first ball and a ball left alone had any of this.
Only the game's batter is `alive`: the Dressing Room, the stroke previews,
the shelf pictures and the batter tests keep the still guard.
`tests/stance.test.ts` holds the waggle and the body with it, the taps, the
stillness and the previews' still guard. The artifact "Alive in His Guard" shows it against the
clip.
## Swipe zones

Where a swipe's direction splits between strokes is `mapSwipe` in
`src/game/InputManager.ts`, measured off straight up, and two of its edges
are the mode's (`SWIPE_ZONES` in `src/config/gameplay.ts`): the block's fan
either side of straight down — fifteen degrees in the Blast, where nobody
blocks, twenty-five in Survival and the Marathon, where it keeps a batter in
— and where the cut gives way to the late cut, 117.5 and 120 degrees off
vertical. Below that the late cut runs down to the block, and on the leg side
the leg-side stroke runs all the way round to it, the pull or the hook at a
bouncer (above). On a full meter the scoops take both diagonals from 110
degrees to the block, as they always did. The numbers came out of a model of
a thumb twelve to twenty degrees off what it meant; the cost was a careful cut landing 92% of the time in the Blast rather than 98%.

A swipe is timed where it becomes one, when the thumb has moved
`GAME.swipeDistance` (24 pixels), as it always was; which way it went is read
further on, at `GAME.swipeRead` (40), or where the thumb lifted if that came
first, so a short flick still plays. The first pixels of a flick curl, and
read there a cut swipe came out pointing at the late cut. Reading later
without timing earlier would have made every swipe up to sixteen
milliseconds late, which is a grade.

## The two defences

The block (`'DEFEND'`, the swipe straight down or S) is two strokes, and the
ball's length picks one, not the thumb: a ball arriving at the crease below
`DEFENCE_BACK_HEIGHT` (70cm: every full and good-length ball, at 54) gets the
front-foot defence (`DEFENCE_FRONT`), anything above it (back of a length at
81, the bouncer at 113) the back-foot defence (`DEFENCE_BACK`); `backDefence`
in `swing`, and `Game.shoot` meets each where it is played. Built from two net
sessions filmed in slow motion. The front one strides long to the pitch of
the ball, the front knee bent with the head over it, the back leg long on its
toe, and meets it at `DEFENCE_FRONT_CONTACT_MS`, `DEFENCE_FRONT_MEETS_AT`
further down the pitch than a drive, beside the front pad: the bat straight,
the handle ahead of the blade so the face looks down, the top elbow up on
`leadElbow`. The back one goes back and across to off stump with the front
foot drawn back, tall, and meets it late at `DEFENCE_BACK_CONTACT_MS`,
`DEFENCE_BACK_MEETS_AT` back towards the stumps, at the ball's own height (the
height clamp other strokes take is let off for it), the bat straight up in
front of him and the top hand high. Both give a touch, hold (`DEFENCE_CLOCK`),
and go home in one eased movement, the bat lifted straight back past the off
side into the guard as a backlift is, on a curve bent out by
`DEFENCE_HOME_OUT`: that bend is what brings the face, carried along with the
handle (`riding`), round to the guard's own, so nothing turns the bat in his
hands. Home was first taken up and over in front of his face after a stop for
the elbow, which read as the wrists twirling it; the batter tests hold the
way home to under five degrees of turn in the hands and to one rise and fall
of the blade's speed. The old
block took a short step and met everything at the waist, so a bouncer went
through his chest: the Blast called it through to the keeper and Survival
DUCKED. In time it is now DEFENDED off the bat in every mode (the SHORT branch
of `resolveShot`, `defended` in `Survive.ts`); late is what it was. They are
`defend`, `defendBack` and `defendBouncer` in the batter tests' `PLAYS`, with
`describe('the block')` holding the stride, the height and the pick, and
`cover-drive.html` has both.

## The back-foot punch

The cover drive's swipe at a ball short of a length is the back-foot punch
(`PUNCH` in `gameplay.ts`, `PUNCH_STROKE` and `this.punching` in `Batter.ts`):
picked by the height the ball reaches him at, as the defences are
(`PUNCH.minBallY`, the back-foot defence's line: back of a length and the
bouncer), so the thumb never chooses between it and the drive; `punch` in
`ShotResolver.ts` is the one rule the rig, `Game.shoot` and both resolvers
read. Built from two net clips, the first from the bowler's end and from
behind, the second from the bowler's end: a step straight back with the back
foot, the front foot left where it is, tall, a high pick-up; down straight, the
hands close in front of the front hip, onto the ball late by the front thigh at
`PUNCH_CONTACT_MS`, `PUNCH_MEETS_AT` back towards the stumps, at the ball's
height up to `PUNCH_HIGHEST` (a bouncer is met up the face, the hands by his
chest, and the body a little further from it, `PUNCH_HIGH_ROOM`: closer, the
top arm folded shut and its elbow flipped), the face to cover and the handle a
little ahead; then driven, the toe swinging out towards cover as the hands come
up close to him, by his chest and then up by his face, the top elbow high,
where it stops at `PUNCH_CLOCK.finish` and holds (carried on up over the
helmet, it read as forced), and the front foot sliding back to the back one,
so the feet finish together and the bat leant out towards cover. Built first as a
vertical bat lifted straight up, which read as no drive at all; then driven but
with the hands at arm's length, 60cm out in front of his face at the finish,
which is not how it is played: the batter tests hold the hands to a quarter of
a metre from his hips at contact and near his head at the finish, and no
higher than his face. The face turns to cover once, in the pick-up (`riding`'s
`at`: a roll made earlier is carried along unchanged, so the downswing turns
nothing), and never again: the batter tests hold the downswing to the guard to
under five degrees of turn in the hands. It holds the finish (`PUNCH_HOLD_MS`)
and goes home in one movement (`liftedHome`, shared with the defences, here
through a given direction, `PUNCH_HOME_VIA`: the bat hanging from his hands as
they come down, `PUNCH_HOME_LAG`, before it goes back up into the guard), the
one route that turns nothing in his hands. Out of the drives' handling in
`apply` (`driveShot`, the helmet clearing, `driving`), which would re-turn its
face before the ball.

It goes along the ground through cover (`punched` on the outcome,
`PUNCH.angle`), never six, and the attempt is `grounded`: middled four, a
shade under two or three (one or two in a Test), held back ones and twos, poor
(or across a ball on the legs, under `SOLID_SHOT`) the edge behind or a thick
edge for one (`punched` in `ShotResolver.ts`). A bouncer is pushed for ones and
twos at best and poor is caught behind three times in four (`PUNCH.bouncer`). Survival and the Marathon pay
it off their own ladder, with the bouncer's in `shortBall`; the wrapper only
tags it, as it does the square drive. Missed, a bouncer goes through to the
keeper. It is `punch` and `punchBouncer` in the batter tests' `PLAYS`, with
`describe('the back-foot punch')`, and `cover-drive.html` has it.
`scripts/punch-check.mjs` plays it in a browser on `?bouncers=1`, keys and a
real swipe up and to the off, in the Blast and in Survival.

## The square cut

The cut at pace (`CUT_STROKE`, `CUT_HIGH` and the `paceCut` branch in
`src/entities/Batter.ts`) keeps its crouch, its clock and its wrap over the
front shoulder, and fixes three things. The face rides the handle (`riding`)
and is turned to the bowler as the bat comes down, a little over the ball:
drawn from the keys it looked at the keeper, and the back of the blade met the
ball. His body follows the ball across by its width less `CUT_ROOM`, not by
the drives' share of it, and his trunk leans away from it, so the arms reach
it out straight: by the share, the ball was under him and the elbows were at
60 degrees off a length and 25 at the waist. And the bottom hand rolls over the
top one as the elbows fold, so the curved back of the blade lies on the front
shoulder at the wrap. On the way there the bat goes up in front of his face
(`carry` in the branch): with the hands out at the ball, the straight way from
there to the wrap went through his helmet. It is `cut` and `cutLow` in the
batter tests' `PLAYS` and in their shared checks.

## The cut off the spinner

The cut has a second build for a spinner's ball (`spinCut` in
`ShotResolver.ts`, `spun` on the delivery: off-spin, leg-spin and the arm
ball), off the same swipe and the same D key. An off-spinner pitched outside
off turns in at him and a leg-spinner pitched on leg turns away, and neither
leaves the width the cut wants, so he makes it: back and away towards leg
(`SPIN_CUT_ROOM`, the step taken off the ball's line), the front foot drawn
back with him and the stance opened wide, the weight on the back foot and the
bat high (`SPIN_CUT_LOAD_MS`). Built from a clip filmed from in front. He meets
it on the back foot out in front of off stump at `SPIN_CUT_CONTACT_MS`, the
arms out straight and the face over the ball; the hands go through level
towards point, then up with the blade upright before his face, and stop at the
peak of the helmet, the elbows down either side of his face, while the bat
tips out past his leg-side ear and lands across the opposite shoulder
(`SPIN_CUT_CLOCK`). Neither the hands nor the bat go over his head: built
first that way, it read as forced. The face rides the handle (`riding`) and
turns only as the forearms bring it down over the ball and as the bat goes
onto the shoulder. Held there as the hook is (`SPIN_CUT_HOLD_MS`, the way home
slowed with it), it comes off the way it went on and down into his guard; the
way back over the top of his head went through the helmet.
Which lines suit it is `SPIN_CUT.fit` in `gameplay.ts`, read through `fitOf`
in both resolvers in place of the cut's own column, which wants width: off and
middle as well as outside off, leg less. Outside leg — the off break pitched
round leg and turning on down it — he is cramped (`crampedCut`, `cramped`,
`SPIN_CUT.cramped`): the bat still comes across him to off, so the ball goes
that way, along the ground and without the arms behind it — squeezed to point
for one or two middled (one in a Test), a single or straight to point a shade
under, off the inside edge onto his pad (`padded`, dead at his feet) worse,
gloved behind three times in four when poor, and missed it goes on down the
leg side and bowls nobody. Never a boundary, and out only when misread and
mistimed: edged every time, it was too harsh, and cut for six it made the cut
one swipe for every ball the spinner bowls, the turn never read. `?spin=1` gives the spinner
every over; `?spincut=1` (`spinCutsEvery`) gives him every ball in any mode,
all of his on every line, the outside-leg ball included, and is practice. It is `spinCut` in the batter tests' `PLAYS`, and
`cover-drive.html` has it beside the drives and the hook.

## The pull off the spinner

The spinner drops one ball short every over (`DRAGGED`, `draggedPerOver` in
`SPIN_BOWLING`): an off break or a leg break, never the arm ball, pitched at
7 metres where the rest land at 8.3 and climbing to reach the batter at the
waist rather than the knee. Its place in the over is drawn off a stream
forked from the seed (`drags`, `placeDragged`), as the round-the-wicket overs
are, so no other ball of any innings moved when it arrived; a Rival Match
begun before it shipped and finished after would see the spinner differently.
It is too short for either sweep (`SWEEP.minBounceZ`), and the strokes the
other swipes play at it are the ones its height already picks: the cut off
the spinner, the back-foot punch and the back-foot defence. The straight and
on drives at it (`droveShort`) are four at the most, never six and never
lofted: middled four, a shade under two, held back one or two, poor up and
caught three times in four (`droveShortBall`; in a Test, four off the mode's
own ladder).

The leg-side swipe at it is the pull off the spinner (`spinPull` in
`ShotResolver.ts`, read by the rig and every mode's score), and so is the
leg-side swipe at the arm ball timed good or better; timed OK or worse, the
arm ball is still the flick. Picked by timing, it is picked on the grade of
the mode that pays it (`gradeFor` in `src/Game.ts`): Survival's and the
Marathon batter's windows are narrower than the Blast's. The full ball is
swept or flicked as it always was. A normal stroke, no meter. In the Blast
timing names it (`spinPulled`, the hook's ladder): middled six, a shade under
four, held back one or two, poor off the top edge and caught at short fine
leg three times in four, a single off the bottom of the bat otherwise;
missed, it goes on and is judged as any ball that beat the bat. The line is
not held against it (`fitOf` stands aside for it in Survival too). In a Test
it is paid off the mode's own ladder, as every stroke at the spinner is, and
only tagged (`spinPulled`) so the ball leaves where it was hit,
`SPIN_PULL.angle`, between midwicket and square leg.

The stroke (`SPIN_PULL`, `SPIN_PULL_CLOCK` in `src/entities/Batter.ts`) is
built from a net session filmed from the bowler's end. The back foot steps
back and across towards off stump and takes his weight (`SPIN_PULL_BACK`,
pull v2's), and the front foot stays where it stood in his guard
(`SPIN_PULL_FRONT`): he meets the ball on it. The bat is pull v2's, on the
hook's clock: high, down and out, met at `SPIN_PULL_CONTACT_MS` out in front
by `SPIN_PULL_MEETS_AT` (nearer than pull v2's, which meets a bouncer at the
chest) with both arms long and the flat face to the bowler, swung round flat
out to leg, then up over the front shoulder and wrapped behind his head with
the curved back of the blade on it. The front foot goes with the swing: up on
its toe as the bat comes through, then lifted and carried round on the leg
side about the back foot, to land behind it on a line across the pitch 45cm
in front of the stumps (`SPIN_PULL_LANDS`), his hips going back over the back
foot as it does (`spinPullKey`'s carry). He turns as far as square to the leg
side and no further, and the knees bend the way he faces, as the hook's do.
He stands up through all of it, the hips no lower than in his guard. Built
first squatting on a wide base with the bat swung round in one plane, then
with the spin cut's feet planted for the whole stroke, neither was the clip.
The spinner's ball arrives at the waist and the arm ball at the knee, not a
bouncer's chest, so the swing is drawn for the waist (`SPIN_PULL_GRIP`,
`SPIN_PULL_BALL`) and carried down to the arm ball out in front
(`SPIN_PULL_SUNK`), where the bat slopes down to it from the hands as the
spin cut meets that ball and the chest leans out over it a little
(`SPIN_PULL_LOW`, below `SPIN_PULL_LOW_BALL`). From out to leg the hands climb
to the wrap on one even curve: drawn from pull v2's own keys, they came
forward and up in a surge between round and the climb and then went back
again, which read as forced, and the batter tests now hold them to going back
and up all the way and under 8.5 metres a second. The face rides the handle
(`riding`) with pull v2's two turns: square to the bowler on the way down,
and the bottom hand rolling over the top one as the elbows fold; from the ball
to out to leg nothing turns in his hands. Held at the wrap
(`SPIN_PULL_HOLD_MS`), then home as pull v2 goes home, the bat upright over
his head and let down into his guard. It is `spinPull` and `spinPullLow` in
the batter tests' `PLAYS`, `tests/spin-pull.test.ts` holds the ball and the
rules, and `cover-drive.html` has it.

## The late cut

The late cut (`'LATE_CUT'`, `LATE_CUT` in `src/entities/Batter.ts` and
`src/config/gameplay.ts`) is an ordinary stroke, no meter, in every mode, at
pace or spin: the swipe down and to off, between the cut and the block
(`SWIPE_ZONES`), or D and S together, D first — S alone commits the block at
once. With a full meter, at a ball that can be
scooped, that diagonal is still the reverse scoop; anywhere else `playedAs`
turns the reverse scoop's input into the late cut where it used to be the
block.

Built from a coaching film shot from in front, square on the off side and
from the bowler's end. The back foot goes a long way back towards the stumps
and across towards off (`LATE_CUT_LOAD_MS`), and he sinks on it until the back
knee is nearly on the turf, the front leg left where it was, bent, its knee
sent forward over its foot rather than out to off as a standing knee is (it
rose to his hips where the bat comes down). The bat is held high while he
goes down and comes down late and steep, the hands out at his hip, the front
elbow ridden up on `leadElbow` as the drives' is, to meet the ball beside the
back pad at `LATE_CUT_CONTACT_MS`, `LATE_CUT_MEETS_AT` behind where every
other stroke meets it, with the face open to third man (`riding`, turned once,
on the way down). Not struck: the blade goes on down until the toe points at
the turf behind him, held there with his head down over the hands
(`LATE_CUT_CLOCK`), then lifted out towards point, clear of the back arm, as
he gets up into his guard.

It wants a ball going past off stump (`COMPATIBILITY`'s `LATE_CUT` column):
across one on the stumps he misses it and is bowled. On its ball timing names
it (`lateCut` in `ShotResolver.ts`, both resolvers): middled four along the
ground to third man (`SHOT_ANGLES.LATE_CUT`), never six; a shade under two or
three (a single or two in a Test, where nobody runs three); held back one or
two (one); poor off the edge to the keeper three times in four, else a thick
edge for a single. A bouncer goes through to the keeper. `?latecut=1`
(`lateCutsEvery`) bowls nothing but pace aimed at off stump or wider, in any
mode, and is practice. It is `lateCut` in the batter tests' `PLAYS`, and
`cover-drive.html` has it beside the drives, the hook and the spinner's cut.

## The slog sweep

The slog sweep (`SLOG_SWEEP`, its clock `SLOG_CLOCK`, in
`src/entities/Batter.ts`) is the meter's stroke at the spinner, rebuilt from
a broadcast recording in three angles. A long lunge down the pitch, the bat
high behind the back shoulder, then down behind him and through flat out in
front of the front pad, the arms long: it meets the ball `SLOG_MEETS_AT`
further down the pitch than the drives (`meetsAt` in `src/Game.ts`), a long
way from his body, his hips forward over a front shin held upright and the
back knee on the turf (`tests/sweep-geometry.test.ts`), the body following
the ball's line all the way across, the hands out in front of him from the
backlift on (`down`, after `drop` brings them down by the back hip with the
bat still cocked). After the ball it keeps going round: at the bowler at
chest height, up over the leg side with the hands out that way, upright
beside his head, then over the top and down behind it, his chest turned
square to the leg side so the back arm comes up in front of his face; home
down in front of it. The face rides the handle from the swipe (`riding`);
after the ball the forearms roll it over once, evenly, through the climb, so
behind his head the flat face looks at the sky and the curved back lies
against him (it came down face first onto his shoulders riding the handle
alone), and it unwinds once on the way home. The finish is held a good while
and the way home unhurried: from the finish his clock runs slower, as the
hook's does (`SLOG_HOLD_MS`). Kneeling, the back shoe's toes point down the
pitch so its sole faces the keeper (`backFootYaw`); turned side on, the sole
faced square. Sent straight up the pitch and over his head
from the ball, it read as another stroke; and a backlift leaning over his
head brought the bat down through the back arm, which nothing tested until
the batter tests held the blade off both sleeves.
The orthodox sweep (`FLAT_SWEEP`) is still built on the kneel the slog was
before (`KNEELING_SWEEP`) and meets the ball where the drives do. It is
`sweep` in the batter tests' `PLAYS`, with its `meets`.

## Super10: ten overs, five bowlers

Super10 (`SUPER10` in `src/game/modes.ts`, its numbers in `src/config/super10.ts`)
is the Blast's ball for ten overs: `resolveShot`, the confidence meter and the
charge, coloured kit, the Blast field and the lights by the player's clock.
Three wickets, and the batters are the Marathon's three, opener, No. 3 and
tailender, by how many are down (`batterAt`), each named walking out
(`walkingOut`), with the window for a six narrowed to `SIX_WINDOW` of theirs
and every window but the miss narrowed by `DEATH_TIMING` in the last two overs
(`windowsAt`, read through `windows` in `src/Game.ts`).

Five bowlers bowl two overs each, never two running (`scheduleOf`): the swing
bowler with the new ball in overs one and three (the Marathon's swing, late, no
reverse: `SWING_LEVEL`, and the Marathon swing bowler's own balls at his speeds
and time to the bat, about 150 and 0.55 seconds: `bowledAs` in the plan, where
the Blast's arcade timing had the ball take 0.8), the seamer (the Blast's own over) in the second, the
spinner always fourth and the sling bowler (the Marathon's express bowler)
always fifth, the spinner and the seamer in the sixth and seventh in an order
drawn off the seed, and the death bowler and the sling bowler closing it, eight,
nine and ten. The generator takes it as a fixed schedule (`blocks.fixed` in
`SUPER10_PLAN`, `src/game/DeliveryGenerator.ts`). The death bowler is new and
bowls nowhere else: his over is planned at its top as the express bowler's is
(`placeDeath`, `DEATH_OVER`): two yorkers, one of them often wide of off, a
dipping slower ball, half the time a slower bouncer, the rest full and quick at
135 to 145, every ball flagged `death`.

His action (`DEATH_ACTION`, `DEATH_RUN` in `src/entities/Bowler.ts`) was built
from slow-motion clips of the most famous death bowler, from behind the batter
and side on, and he is never named: no bowler is, in any mode, and players tell
them apart by their actions and the speed gun, which Super10 shows on every
ball. A short, choppy run (its own `stride` and `accel`) with the ball at his
belly in both hands; the ball arm looping out wide to his side and up above his
head before a low hop (`loop`: the one arm path in the game that leaves the
carry before the bound), the front arm out level at the batter from the
take-off; front-on all the way; then the ball arm once all the way round from
over his head, straight — over in front of him, down past his hip, up behind
him and over the top to the ball — slow from the top and quickening all the way
to the release (`loop.turn`, `loop.spin`; it is behind him at `loopDrop`), the
front arm turning over with the last of it on the same clock and on round
behind him (the loop branch of `frontArmAngle`); a deep fold and the back leg
kicked high. The first build only dropped the arm back and whipped it over,
half a turn.
The elbow's hyperextension is left out: the bowling arm is one straight limb.
`tests/bowler.test.ts` holds him to every rule the other two actions keep, and
`tests/super10.test.ts` to what makes him his.

The field (`src/game/super10-field.ts`, in `tests/super10-field.test.ts`) is
nine men, set from the fields T20 sides use: the claude.ai artifact "The T20
Field Book" (https://claude.ai/artifact/C3YAV9BVN4v4QGCUHPEfZX), fourteen
fields with the situation each is for. The positions (`POSITIONS`) are the
book's angles, with nobody within twenty degrees of straight, in front of the
sight screen (its long-off and long-on stand at 22), nobody within fifteen of
another man at his depth, and a man in the ring off the line of the man behind
him (`IN_LINE`, and `IN_LINE_NEAR` near straight, where the camera behind the
bat would see one in front of the other); no slips, gully or short leg, so the
book's slip is a point or a backward point. Each bowler has two of the book's
fields (`BOOK`, `PLANS`), his first and his other: the swing bowler New-ball
attack and Square riders, the seamer Hard length and Square riders in the
Powerplay and Cutters and the Straight field after it, the spinner Leg-spin
strike and Spinner attacking, the sling bowler the Short-ball field and
Cutters, the death bowler Wide yorker and the Straight field. Two men back in
the Powerplay and five after it, as the book has them, but the spinner
attacking with three. A field is set at the top of an over and kept for all
six balls, its men stood straight on their marks (`Field.standOn`): nothing a
ball does moves a man. The first build plugged the gap a boundary had gone
through, and walked the men to every new field, and the player saw the field
change every ball and men forever running about. Which of the two is his
(`planFor`): the spinner attacks a new batter, a wicket in the over before his;
any other bowler takes his other field only when it has men back on the lines
of more of the batter's last eight boundaries than his first does, two at
least. A bowler bowls to the field he set (`BOWL_TO` in
`src/config/super10.ts`, by the field, told to the generator as `field`): the
wide yorker wide of off, the straight field and the cutters at the stumps and
the pads. There is no captain: the bowler signals a man (`signal` in
`Fielder.ts`, chosen by `signalFor`, `GameScene.bowlerSignals`) only when he
takes his other field or Power Surge brings two in, and the next ball waits
for it (`Field.settled`).

In Super10 the swipe steers the stroke (`steerOf`, `steer`): every ordinary
stroke has an arc on the ground, and the swipe's place inside its zone is the
ball's place along the arc; a key plays the middle. The leg side's one swipe
is the flick, the pull, the hook, the pull off the spinner or the sweep by the
ball, each with its own arc. Steering into the outer third either side
stretches the stroke (`STRETCH`), which turns a clean hit into a mishit half
the time. The meter's strokes — the charge, the slog sweep, the scoops — are
not steered and the field never stops them. The steered line arrives on the
outcome as `angle`, and `sectorOf` in `src/scene/flight.ts` lays the timing's
bend on it, so what the field judges is the line the ball is drawn along.

A ball is fielded by how far it passes the nearest man (`fieldRules`, laid on
`resolveShot`'s answer in `resolve`): a four along the ground within
`RING_REACH` of a man in the ring is stopped half the time, a middled one a
quarter (`RING_STOPS`, the softened ring); within `DEEP_CLEAN` of a boundary
rider it is cut off for one or two, within `DEEP_REACH` saved for two or three
or beaten; a six not middled is caught on the rope when he is under it, and a
middled six clears everybody. The outcome carries the fielder (`fielder`) for
the call (STOPPED · MID-OFF, CUT OFF · LONG-ON, LONG-OFF · ON THE ROPE,
`fieldLine`) and the scene: in the picture he gets across to it (`toRider`),
out of it the ball flies out of frame and the side label it went past says his
name (`FieldUi.light`). Catches everywhere are dealt a step, a run or a dive
(`findCatch`'s `running`), not always the full sprint and dive. Power Surge
lights up at the end of the fifth over and is taken in the break before the
sixth, seventh or eighth (`surgeOffered`; its chip, or P), the bowler waiting
`SURGE_WAIT_MS` at his mark while it is offered; not taken, it goes on by
itself in the ninth (`surgeAuto`), and the tenth never has it: the two men back
nearest straight come in. `scripts/super10-sim.ts` plays all of it with a
steering player: a pro about 146 (typically 158, the best near 250), a regular
59, a beginner 20 with a boundary in seven innings of eight, against 167, 69
and 24 with no field, and no meter strokes in any of it. Five men back cost
about what the plug had, so the totals hardly moved when it went.

The scene draws six of the nine (`drawnOf`: the six nearest straight), stood
on their new marks when the field changes (`Field.standOn`,
`GameScene.super10Field`).

The field is shown in two corners (`src/ui/FieldMap.ts`, Figma section 16A,
`422:5003`), both live all innings. Bottom right, the field map: only the
ground and the dots, never on a panel — a dark see-through ground under a
white rope and a white dashed ring, the fielders red and the batter blue
whatever either side wears (the kits' own colours lost the dots whenever a kit
was near the other side's or the grass), the ball's line yellow on a dark
edge; a new field has the dots slide to their places as a ring pulses twice
and the field's name floats over it (WIDE YORKER · 5 OUT, FIELD CHANGE · …);
it is a plan of the ground, not a scale drawing (`onMap`): the ring's men
inside the dashed circle, the boundary riders just inside the rope, which to
scale stood a few points apart, the ground being twenty-eight metres square; after a shot the ball's line is drawn to where it went, and the man who
caught it or got to it is lit with a yellow ring (`takerOf` in `src/Game.ts`:
the field's rules' man, or the drawn man the scene sent for a catch,
`Field.catcher`), until the next ball; a tap (or F) enlarges it from its
corner, and a tap, the bowler's first stride or six seconds put it back.
Bottom left, Power Surge (`SurgeState`): locked to the end of the fifth over,
gold and breathing in the breaks it can be taken in, its ring emptying over
the bowler's wait; a ring filling a sixth a ball through its over, with POWER
SURGE over the ground when it is taken and a SURGE badge under the scoreboard;
a grey tick once used. A first Super10 in a browser opens with the field
map's coach card (`FIELD_STEP` in `ShotsIntro.ts`, kept in
`hitman-field-intro`); the surge is taught by its tag when it first lights up.
The pause sheet has the map drawn solid. The design's assets could not be
downloaded into this build, so the bolt and the rings are drawn in code.

What is not here yet: the boards and the career, and a card on
Choose a mode. Until it has a board, an innings of it is practice
(`practising`): posted nowhere, counted toward nothing, and the card, headed
SUPER10 · 10 OVERS with no best quoted, says the mode is still being built
whatever the innings was worth (`why: 'building'` on the practice offer).
It is reached by `?mode=super10` off production only (`SUPER10_OPEN`).
`scripts/super10-check.mjs` plays one through on the dev server: the bowlers in
the schedule's order, one real ball from each kind with his own action, the
speed gun, the No. 3 named after a wicket, the field map and Power Surge in
their corners, each over's field and the bowler signalling it, the field
map's coach card once, the card's heading and its line, and nothing sent.
The actions are looked at in `bowler-sheet.html`, every action a row at the
same moments, from the batter's end or side on (`scripts/bowler-sheet.mjs
out-dir batter side`): a software-rendered game's clock does not land a
screenshot on the frame it was asked for, and the sheet does.
`bowler.html` (`src/bowler-preview.ts`) has all three actions live in 3D, on a
pitch with a batter at the far end, with a camera to turn round him, set views
and one that follows his run; `scripts/bowler-artifact.mjs` builds it into
one file, as `cover-drive-artifact.mjs` does the strokes.

## A newcomer's first innings

The first three finished innings in each mode are batted a little easier
(`src/game/newcomer.ts`): the OK window is widened into POOR and the block's
clean band into the edged one, by `EASE` — 1.35, 1.2, 1.1 — and then not at
all. PERFECT and GOOD are never moved, because they are where the sixes and
fours come from: the help turns a skied catch into a single and a beaten block
into a dead bat, so it keeps a newcomer in without handing anybody a boundary,
and a good player who clears their browser for an easy innings gains next to
nothing. They are bowled no yorker — none owed for sixes, and the express
bowler's is a full, fast ball in its place — and every other ball as before:
the pace stays. Nothing on screen says so, and the innings count on the boards
and the career as any other.

A mode is new on its own. The count is this browser's (`hitman-newcomer`),
added to in `end` beside the career's count — only a finished innings, so a
restart does not keep the help going — or the career's where that is further
on, as it is for a player brought back by a key. A browser that had batted
here before the help shipped is written down as past it on its first load
(`seedPlayed`). None in a Rival Match, in practice, or under `?debug=1`, whose
checks time their strokes to the real windows; `?newcomer=1` beside it lets
the help back in by the browser's own count. `scripts/newcomer-check.mjs`
walks when it moves on. GoatCounter counts `newcomer-1` to `-3` a mode.

## `?moments=1`

A row of keys along the foot of the picture, one a milestone — 50, 100, six
sixes, and the Test marks 150 to 400 — for looking at any celebration on a
phone without batting to it. A tap between balls plays the moment at once and
holds the bowler at his mark until it is over; with a ball on its way it waits
for that ball to be dead, which is when a real one goes up. It is the same
celebration with none of the innings: no runs, nothing counted, nothing sent.
Add `&mode=marathon` for the Test kit and ground.

## `?actions=1`

Two rows of keys along the foot of the picture — ADMIRE, LEAN, WATCH, TWIRL,
BRUSH, SHADOW, SCRUB, SKY, DOWN, RIBS, HAND, HELMET — one a thing the batter does once a ball is done with (`AfterBall` in
`src/entities/Batter.ts`), for looking at each on a phone without waiting for
the ball that brings it, which for most of them is only some of the balls that
call for one (`afterBall` in `src/game/afterBall.ts`). A tap between balls plays the stroke
it follows, at no ball, and then it, and the bowler waits at his mark until he
is back in his guard; with a ball on its way it waits for that ball to be dead.
FALL is the retired-hurt fall, on the helmet, the ribs, the glove and the thigh
in turn; he gets up again for the next ball, which a real one never does.
Nothing is bowled, scored or counted, so it is not practice
(`tests/practice.test.ts` names it). `scripts/actions-check.mjs` walks it.

## `?rate=1`

A row of keys along the foot of the picture — GAME, BLAST, MARATHON, SURVIVAL,
RIVALS — each putting the star sticker up for that thing, for looking at it
and playing with it on a phone without finishing the innings that earns it.
It is the real sticker and the real follow-up, and nothing is sent or
remembered: the stars go nowhere, the follow-up's last screen says so, and
asking again is one tap. It changes nothing about the batting, so it is not
practice (`tests/practice.test.ts` names it). `rating-check` walks it.

## Level Up

An innings that carries a career onto a new rung ends on Level Up
(`src/ui/LevelUp.ts`) before the innings card, which waits underneath. Each
rung opens its own way, built from the game's own pieces (`opening` in
`levelUpFx`, the story in `src/game/levelup.ts`):

- EMERGING PLAYER, the road: the player's own Road to Hitman (the real
  `roadToHitman`, over the place the card will stand), its fill running on to
  the next medallion, which squats, lights and pops, then flies off the track
  spinning like a coin to land big in the middle; the cannons go, LEVEL UP
  drops in, the card rises and the medallion flies into its badge.
- STAR, the six: the card waits with the old rung showing; the ball comes in
  from the corner already at full speed and hits it square, and the card spins
  like a struck coin onto the new rung as LEVEL UP bursts out of the impact.
- HITMAN, the chevron rush: the end card's chevron springs up in gold, squats,
  charges and fires a train of five up the screen — a gold flash as it passes
  LEVEL UP, chevron fireworks off the top — and the card is pulled up in its
  wake; a last chevron dives into it.

All three end the same way: the card flips over to the new rung, the cannons
fire from both bottom corners, the figure counts on, and the rung's name and
two keys follow — SHARE STATS CARD (the new card as a picture, `shareCareer`
in the HUD) and GO TO SCORECARD (Escape too), which lets the innings' unlocks
follow. Everything on it is worked out from one clock: every move a
closed-form spring (`spring`, `SPRINGS` — bounce for small moves, `soft` for
long travel, or the card sails past and covers the words) and every piece of
confetti a closed-form flight, paper that sways and turns over with a darker
back. So any moment can be drawn on its own: a tap before the keys jumps to
them, and reduced motion is the last frame, still. The game's ground is not
drawn while it is up.

The way here is a list of things that did not work, and they are the rules
now: no field of arrows or rays behind the words (too busy), not a flat dark
ground with nothing happening (too quiet), not a three.js room of chevrons
(cluttered, generic), not the ball sliding from A to B (no speed), not a
cinematic in the stadium (read as an advert). What worked was the game's own
pieces, springs with anticipation and overshoot, and paper confetti — the
Duolingo playbook.

It is the store's answer that decides it — `climbedTo` between the career as
it stood before the innings was sent and the one `/api/innings` hands back —
so it goes up a moment after the card does, and only while that innings' card
is still up. The career before is read *before* the send: `countInnings`
writes its answer into the mirror, so a mirror read on the answer is already
the new career and nothing would ever have been climbed (which is what the
`tier-` counts had been doing on a session's first innings).

Each rung is a bigger occasion than the one below it, and both halves of that
are held in `tests/levelup.test.ts`: which rung opens which way, and
`levelUpFx`'s figures — confetti a wave, waves of it, the gold shower (HITMAN
alone), the burst out of the moment itself, shockwaves, flash, shake, glints,
the crowd — none may fall going up, and none may pass a ceiling. The beats
(`levelUpBeats`) and the buzz in the hand (`levelUpHaptics`, played by
`src/game/haptics.ts`) come from the opening: ticks as the road fills and a
knock as the medallion pops, one hard knock as the ball hits and ticks
slowing with the spin, a rising buzz as the chevron charges and a tick for
each in the train; then the turn's burst, longer up the ladder.
`navigator.vibrate` where there is one, and on an iPhone the system tick a
switch gives, one a pulse.

`?levelup=1` is a row of keys — EMERGING, STAR, HITMAN, and TEST STAR and TEST
HITMAN in the Marathon's green — putting it up over a made-up climb, counting
and following with nothing (`tests/practice.test.ts` names it), and
`__cricket.levelUp('star', 'marathon')` does the same for the checks.
`scripts/levelup-check.mjs` reaches it the real way first — two Blasts of 180
for a named player, the second over 350, opening on the road — then every rung
by name, each on its own opening, ending flipped onto the new card.

## `?welcome=1`

A row of keys along the top of the picture — NEW, BACK, EDIT, TAKEN, SIBLING,
MONTH, OFFLINE — each putting the welcome before the first innings up the way
a player in that spot would see it: a new player, one coming back with their
name filled in, the edit from My Stats, and the four answers the store can turn
a name down with (somebody else's name, a sibling claimed in the last day, a
second new name inside the month, and no board at all, which opens the gate).
The rules for a name are the real ones; the store's answer is stood in for
(`answerPreview` in `src/Game.ts`, in the store's own words), so nothing is
sent and nothing is kept, and each can be tried again with one tap. It changes
nothing about the batting, so it is not practice (`tests/practice.test.ts`
names it).

## UI v1: the handover and `?ui=1`

The way in is redrawn (phase 3): the cover (`src/ui/Cover.ts`) — the poster,
the profile chip that always opens My Stats, the board widget quoting your best
and place (asked of the store below the fifty), the leader, or a big score made
in the last day, turning over every few seconds — and a poster that moves, the
handover's section 11 motion poster, and stands still under reduced motion; Choose a mode (`src/ui/ModeSelect.ts`) — the Marathon and Blast
posters with best and place, Survival's banner, the boards' podium, My Stats in
the tier's material and Rivals, its figures drawn into keys bound once so ids
never go stale (`modesFill`); and the name screen (`Profile.ts`). No sound key
on Choose a mode: that corner is the avatar. `scripts/entry-check.mjs` walks all
three for a new player and a returning one and photographs them.

The end of an innings is redrawn (phase 4, the handover's section 05): one
card for every mode, its parts in `src/ui/EndCard.ts` — the Blast's
over-by-over chart, the Marathon's worm and batting card, Survival's injury
ring — and the player card under them. A named player's card says the place
the store answered with (`placeNow` in `src/Game.ts`), on the fifty or below
it, new best or best still standing, never a guess off the board on screen;
every named innings is posted, so it always has one. The keys along the foot
stand on the overlay, outside what scrolls (`.ec-screen>.ec-keys`), so the
card scrolls up from under them to its last line, the career key included —
inside the scroller they rode over it. `scripts/endcard-check.mjs` writes a
Blast and a Marathon through the debug hooks (`__cricket.blast`, `marathon`)
and lets a Test end itself — `finish` stops one mid-innings, lost with no
wicket down, which the store turns away as impossible — then photographs each
card and scrolls one to its foot.

The game is being redrawn from a Figma handover (file `JhIdkSdtMSriYe3W5y3NAa`,
canvas `125:4590`), a phase at a time. The foundations come first and change
nothing on screen: the design's colours, faces and measures are named in the
`:root` block of `src/styles.css` (`--c-*`, `--f-ui`, `--f-display`, and `--u`,
one design pixel of the 402-wide phone it was drawn on), and its components are
in `src/kit.css` under a `k-` prefix with their markup in `src/ui/Kit.ts`. A
screen moves onto them when it is redrawn; until then nothing older reads them,
so an untouched screen cannot change colour under it. Write new sizes in `--u`
(it is container units underneath, so the desktop column scales it too).

`?ui=1` is every part in every state on one page, decided in `main.ts` before
the game is imported, for holding against the Foundations page on a phone. It
changes nothing about the batting, so it is not practice
(`tests/practice.test.ts` names it). `scripts/ui-check.mjs` holds each part to
its Figma master's size, checks both faces load and every target is 44, and
photographs the page at a phone's width and in the desktop column.

The leaderboard is redrawn (phase 5, the handover's section 06): one screen
for every board, drawn by `src/ui/Board.ts` from one description
(`BoardScreen`) that each board is turned into — `blastBody`, `surviveBody`,
`marathonBody` (Team and Batters) and `careerBody`. A top bar, the mode and
ladder pills (the mode menu with each mode's place, the ladder sheet, and
How ranking works under the (i), with What's new beneath it), a pager, a
podium of three under spotlights that folds to chips as the list scrolls,
the list in a sheet tinted to the mode, and a dock: the player's line, which
steps aside while their own row is on screen, and PLAY AGAIN after an
innings of that mode, the mode's own PLAY from anywhere else, none
mid-innings. A swipe sideways or the arrow keys go to the next mode. After an
innings the board says what it did (entered at #N, up N places, best still
holds, outside the top 50) from the store's answer to the post
(`boardFrame` in `src/Game.ts`), tags the row and opens on it; a guest's
innings stands where it would, green and dashed, with Add name. My Stats is
no longer a tab on the board: it is the cover's profile chip and the end
card's door, and the page's "Played before?" link is wired there now.
`scripts/board-ui-check.mjs` walks it on `?demo=1` and photographs every
state, the empty and offline boards stubbed at the network (offline on Test
Survival: in development a Blast board out of reach stands in invented rows).

My Stats is redrawn (phase 6, the handover's section 07): `src/ui/StatsSheet.ts`
draws the career card in the page, in the material of the tier (matte navy,
brushed bronze, black with a chrome edge, black and gold foil; the
Marathon's in its green with crimson rising, gold on it at HITMAN, but its
EMERGING PLAYER the red of a Dukes ball with bronze trim and faint chevrons,
and its STAR the Star card's black and silver, as TierCard's `marathonOf`
paints it), then Road to Hitman, six figures a mode with Best rank
(`bestRank` in `src/Game.ts`: the innings board's place and every career
ladder's, the best of them), and the key as a ticket stub. A switch at the
head moves between the modes; the cards are still a rail, one a mode, so a
swipe does too. SHARE MY CARD is pinned to the foot, or PLAY YOUR FIRST
INNINGS before anything is counted. The painted card (`StatsCard.ts`) is no
longer shown — it is painted behind the screen as before and is what the
share key sends, a picture as it always was. The four tier cards are on
`?ui=1`. The key's two sheets and Bring your record back are bottom sheets
now (`CareerKey.ts`, `Restore.ts`), their ids as they were.

Rivals is redrawn (phase 7, the handover's section 08) over the same logic
and the same ids: every screen stands on BG / Rivals (your blue bloom top
left, theirs orange bottom right, a halftone, `src/assets/rivals/`). Rival
Matches has the record as drawn (`rivalsRecordMarkup` in `src/ui/Record.ts`:
won, lost, drawn, the last four results as chips from `recentForm`, a win
share bar) and one card of challenges, each row two faces, "You vs …", the
verdict or what it waits on with its age (`ageOf`), and a W / L / … chip; an
empty list says NO RIVALS YET. The room's faces carry a ring in their side's
colour and a JOINED / NOT BATTED / BATTED chip, a hidden score is `???`; the
result puts the winner under a crown with the two innings as cards. The
invite and the head-to-head (now with fours) are sheets from the foot, the
ranking a table, joining from a link a card over the stadium, and can't reach
the match a screen of its own. `challenge-check.mjs` walks all of it (with
`SHOTS=dir` it photographs each step); `?room=won` and its siblings put any
room face up.

In play (phase 8, the handover's section 09): the pause sheet as drawn — a
black strip with the game's name by a dot in its colour and where the
innings stands, PAUSED, RESUME INNINGS, RESTART and CHANGE MODE side by
side, and Crowd, Ambience and Lights as one card of rows; the declare key
and the lights stay in the modes that have them (`pause-check` reads the
game's colour off the dot). The physio card is headed BATSMAN CRITICALLY
INJURED, with the injury ring and the real figure beside PHYSIO ON, and
`__cricket.physio()` puts it up by name. HOW TO PLAY on the cover opens the
coachmarks a first innings shows (`howToPlay` in `src/Game.ts`), ending on
CHOOSE A MODE and PLAY NOW, which starts a Blast; the three-ball tutorial is
no longer reached from there. SHARE MY CARD paints the new
tier card (`src/game/TierCard.ts`), on the cover with the address and the
mode's line for the story, or on black with the address and BEAT MY
NUMBERS.

The last of the redraw (the handover's sections 09 and 10): the coachmarks
(`ShotsIntro.ts`, `MarathonIntro.ts`, drawn by `marathonIntro` in the HUD)
are one card at the foot in the game's colour, over the ground under the
design's scrim, with whatever a card is about drawn on the ground — the
swipes fanned from the bat, a widget outlined in a hole cut in the scrim and
named on a tag, the pitch marked. HOW TO PLAY from the cover stands on a
picture of the Blast before its first ball (`howto-ground.webp`, laid whole,
its sides blurred in a wider column), the lanes and the outline drawn on the
picture's bat and meter (`HOWTO_GROUND` in the HUD); `scripts/howto-ground.mjs`
takes it again, and prints those, when the in-game screen changes. The star prompt (`Rating.ts`) and the
questionnaire (`Feedback.ts`) are the same card over the screen dimmed and
softened: the stars in the design's gold, the answers rows with a mark each,
the kit's keys for the ways on. The free-text screen the design leaves out is
kept, last, in the same material; the shared link is the new black with the
orange bloom, the grain and the logo over the card.

Checks that create players name them with letters and give each run a new
id: a name with a number on the end is a sibling of the last run's for a
day, and a player takes a new name once in thirty days, so a fixed id or a
digit suffix fails the second run on the same server.

The orange key is redrawn (Figma `149:18107`, and `149:18112` for the one that
moves): an orange rim lit from above round a face warming from white to peach,
named `--g-cta-rim` and `--g-cta-face`, at the sizes it already had. The older
white-on-orange keys (`.play-button`, `.key-button`, `.rate-more`, the Rivals
PLAY) wear the same colours until their screens are redrawn. `cta({ moving:
true })` adds the two faint chevrons crossing the face — the cover's PLAY and
both PLAY AGAINs — and leaves them at rest under reduced motion.

Road to Hitman's fill is `roadOf` in `src/game/tier.ts`: the medallions stand
evenly, so the fill is a whole rung per tier climbed and the share of the gap
across the last, not a fraction of the top figure.
