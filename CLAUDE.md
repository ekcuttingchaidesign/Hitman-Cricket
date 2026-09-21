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
screen. Four scripts drive a real browser against a dev server and are what
catch those — `stats-check.mjs` for the card and its rail, `whatsnew-check.mjs`
for the stories, `end-card-check.mjs` for the end of an innings and the keys
that live only there, `career-count-check.mjs` for the rule that only a
finished innings counts toward a career.

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

`scripts/board-check.mjs` needs a live database and is the one path the others
cannot reach. Point it at a preview deployment, never at production.

## `?demo=1`

Fills the boards with fifty made-up players, in the browser that asked, saving
nothing. It is how a full board gets looked at without claiming fifty real
names. `?demo=0` or a new tab turns it off.
