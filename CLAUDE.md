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

## Scripts that write are opt-in

`scripts/career-seed.ts` and `scripts/board-fill.mjs` both refuse to write
without an explicit flag, and both default to the harmless development keys
unless `VERCEL_ENV` says otherwise. Keep that shape for anything new: a script
that touches real players should have to be asked twice.

## Checks

`npx vitest run` and `npx tsc --noEmit -p .` cover most of it, but the card is
painted into a canvas and the sheets are wired by hand, so neither sees the
screen. Five scripts drive a real browser against a dev server and are what
catch those — `stats-check.mjs` for the card and its rail, `whatsnew-check.mjs`
for the stories, `end-card-check.mjs` for the end of an innings and the keys
that live only there, `career-count-check.mjs` for the rule that only a
finished innings counts toward a career, `restore-check.mjs` for what a player
with no name is offered and the screen that takes a key back, `key-check.mjs`
for what a player who has one is shown.

Those last two are split by whose screen it is, and that is the point. A check
that registers and then deletes its way back to nameless is testing its own
teardown: the key card was missing from My Stats for every registered player
and three browser checks walked past it, because all three reached that screen
by finishing an innings and none by opening the board from the cover.

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
call for the ball left in place. The burst comes in five styles, each in its
own pen and dealt from a shuffled bag; the check puts each up by name
(`__cricket.power('flame')`), photographs it, and deals five to see all five.
A new style goes in `POWER_STYLES` and in the check's `PENS`. The grey runs on the game's
clock, so it is waited out by asking the game (`snapshot().muted`), not a
stopwatch. It also plays real balls on a hand-wound clock until a special
stroke lands, for the fire trail that burns behind only those
(`snapshot().burning`); that part takes several minutes in software.

`scripts/pull-check.mjs` is the flash for a bouncer pulled and hit, the one
ordinary stroke that gets one: focus lines in the pull's pen, a swoosh behind
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
swipes card and the four rules cards a first Marathon opens with, the two that light the Focus
meter and the pause key, and nothing bowled until they are put away — it is
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
first innings (`src/ui/ShotsIntro.ts`): the six swipes as arrows with a hand
swiping each in turn, the strokes' names at their tips and the keys beside
them on a keyboard, then — where the scoreboard has a confidence meter — the
meter lit with a bar filling under it; nothing bowled until they are put away,
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

The hand (`hitman-hand`) is the batter in the Blast and Test Survival; in the
Test Marathon one of the three bats the other way round from the player
(`leftHandersOf`), so a left-hander's side has two left-handers, and the board
takes up to two.

A player with a name has nothing to press at the end of an innings: a place
earned is posted by itself (`autoPost` in `src/Game.ts`, once an innings) and
the card says where it landed, with the board one tap away. Only a player with no name, a private
window, practice and a Rival Match keep the old offers — and a post that fails
falls back to the register key, so nothing is lost to an outage.

Every other finished innings by a named player is posted too, quietly, with
the card left as it was (`quietPost`), so the store can say where they stand
however far below the fifty: the ranking sorted sets have never been trimmed,
so a place is one `ZREVRANK` away. `/api/score` answers each post with
`standing` — the place now, out of how many, and the place before (`was`) —
and `GET /api/board?player=<id>` answers it for a player who has not just
batted, uncached, beside the fifty that stay the same for everybody. The
quiet post waits for the board to come in: posted before it, an innings worth
a place would be on the board before the card could claim it. One post an
innings whichever way it is asked for (`postOnce`). An innings is two hits on
the address's counter now — the post and the career count — so `RATE_LIMIT`
is 240. Nothing draws the place yet; it is in `snapshot().standing` for the
redrawn end card and board.

`scripts/post-check.mjs` walks that in about a minute: a Test Marathon
written ball by ball and bowled out, for a named left-handed player — posted
once, by itself, with two left-handers in the side and the store taking it,
the card saying where it landed — then a named player's duck against a board
filled to fifty, posted once with the card unchanged and placed last on the
whole board, and asked again through `?player=` — and for a player with no
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
`?wear=fast`, `?spin=1`, `?charge=…`, `?slowmo=…`, `?bouncers=1`, or the
preview builds' `VITE_SPIN_ONLY` and `VITE_CHARGE_ONLY` — is practice
(`src/game/practice.ts`). The card says so in place of an offer, the career
does not count it, and the browser's own best does not move; in a Rival Match
the switches do nothing. A new switch goes into `PRACTICE_SWITCHES` or into
the named exceptions in `tests/practice.test.ts`, which fails on any
parameter the game reads that is in neither.

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

Road to Hitman's fill is `roadOf` in `src/game/tier.ts`: the medallions stand
evenly, so the fill is a whole rung per tier climbed and the share of the gap
across the last, not a fraction of the top figure.
