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
one game, and a build with one card cannot draw a rail of two — so the whole
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
which `?ground=bowl` still builds and which is kept for that and for the
covers — and the stadium both by day and by night. The Blast follows the
device's clock — night from six in the evening to seven in the morning — so a
check that judges the ground's colours in a Blast innings without saying
which is judging whatever the machine's clock says; `?lights=day` or
`?lights=night` asks for one. Build new
scenery through `Batch` (`src/scene/build.ts`), one mesh a colour, not a box
at a time.

`scripts/milestone-check.mjs` is the fifty, the hundred and six sixes: the
grey is measured off the pixels of the grass, and the doodles are judged on
their own clock, because a headless browser rendering the ground in software
can hold CSS animations at their first frame.

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

`scripts/unveil-check.mjs` is the covers: the first innings chosen, in any
mode, puts the old ground up and a swipe pulls it off. Every other check that
starts an innings seeds `hitman-unveiled` so it starts past them, which means this is the only
one that sees them — keep that seed out of it. The two pictures are the same
ball on the ground before and the ground after; `scripts/unveil-shots.mjs`
retakes both together on one build, or the line stops lining up. A new pair
wants a new `REVEAL` in `src/game/unveil.ts`, and the same key in every check
that seeds it.

`scripts/marathon-check.mjs` is Test Marathon at `?mode=marathon`: the batter
named as he walks out, the next one standing after the last was carried off,
the declare key from the twentieth over and not before, the card, the speed
gun, the settle meter turning into confidence at thirty-six balls, the left-hander — the ground mirrored while he is in and off again for
the man after him, his pull on the key to the right — and no innings sent
anywhere that keeps one, since the mode has no board yet. It writes most of
the innings through `__cricket.marathon` and bats the rest.

`scripts/board-check.mjs` needs a live database and is the one path the others
cannot reach. Point it at a preview deployment, never at production.

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
nothing. It is how a full board gets looked at without claiming fifty real
names. `?demo=0` or a new tab turns it off.
