# Going live with the career boards

The order matters. Each step below depends on the one above it, and two of
them are one-way doors: the seed writes founding tiers onto real players'
cards, and rotating the database token breaks the live site until Vercel is
redeployed with the new one.

Written to be followed by a person at a terminal, not by a script.

## Before anything

The whole career update lives on `claude/leaderboards-stats-card-ugrvex`.
Production serves the repository's default branch, `codex/cricket-batting-game`,
so until the two are merged nothing here is visible on
`hitman-cricket.vercel.app` — including `?demo=1`, which is why adding it to
the live URL appears to do nothing.

Check the preview build for the branch first: Vercel → Deployments → the
branch → **Visit**. Play an innings, register a name, open My Stats, swipe to
the Test card, tap a figure. That path is the one no automated check covers,
because it needs a real database.

## 1. Seed the careers

The career boards start empty. Everybody already on an innings board has
played at least the innings that put them there, so the seed counts that as a
career of exactly one, and hands the first sixteen on each board a founding
tier — top five STAR, the next eleven EMERGING PLAYER.

The grant is a snapshot. Whoever stands in the top five **at the moment the
seed runs** keeps STAR for good, so run it in the same sitting as the deploy
rather than days ahead.

Get `KV_REST_API_URL` and `KV_REST_API_TOKEN` from Vercel → the project →
Storage → the KV database → the `.env.local` tab. Use the read-write token,
not `KV_REST_API_READ_ONLY_TOKEN`.

Dry run first. It reads and reports; it writes nothing, and can be run as
often as you like.

Which board it touches is decided by `VERCEL_ENV` alone, and it says which on
its first line before doing anything. There is no way to reach one board by
asking for another:

| `VERCEL_ENV` | What is read and written |
| --- | --- |
| `production` | the live board people are playing on |
| `preview` | the `preview:` keys a branch deployment uses |
| `development` | the `development:` keys, which is the local default |
| unset | `development` — harmless, and indistinguishable from an empty board |

The last row is the one to watch. An unset variable is not an error and the run
looks perfectly successful; it simply reports nobody on the board, because
nobody is on *that* board. In PowerShell `$env:VERCEL_ENV` lasts as long as the
window, so a second command in the same window inherits whatever the first one
set — and a fresh window inherits nothing.

PowerShell:

    cd "D:\Built with Claude\4.Hitman Cricket"
    $env:KV_REST_API_URL="https://…"
    $env:KV_REST_API_TOKEN="…"
    $env:VERCEL_ENV="production"
    npx vite-node scripts/career-seed.ts

Git Bash or a Mac:

    KV_REST_API_URL="https://…" KV_REST_API_TOKEN="…" VERCEL_ENV=production \
      npx vite-node scripts/career-seed.ts

What it should say:

    Dry run. Pass --write to do it.
    classic: 33 rows, 33 to seed (16 with a founding tier), 0 already have a career.
    survive: 16 rows, 16 to seed (16 with a founding tier), 0 already have a career.
    Nothing written.

`0 already have a career` means a clean day one. `0 rows` instead means the
credentials are pointing at the wrong database — stop rather than writing.

Then the real one, which is the same command with `--write` on the end. It is
safe to re-run: a player who already has a career is skipped, so nobody's best
innings is ever counted twice.

## 2. Merge and deploy

Merge the branch into `codex/cricket-batting-game`. Vercel deploys the default
branch on its own; nothing else is needed.

## 3. Rotate the database token

Any token that has been pasted into a chat, a screenshot, a terminal history
or an agent transcript should be treated as public. This one can write, so a
stranger holding it could empty the leaderboard.

Rotating is four steps and they cannot be reordered, because the live site
authenticates with whatever token Vercel is holding:

1. Upstash console → the database → **Rotate token**. The old one dies here.
2. Copy the new `KV_REST_API_TOKEN`.
3. Vercel → the project → Settings → Environment Variables → replace the value
   in every environment it appears in (Production, Preview, Development).
4. Vercel → Deployments → **Redeploy**. Serverless functions read environment
   variables at deploy time, so until this runs the site is still trying the
   dead token.

Between steps 1 and 4 the leaderboard is down, so the four run back to back.
That is the whole of the ordering: rotating before the seed is just as good as
rotating after it, as long as the seed is run with whichever token is current
at the time. The seed does not care which token it is given, only that it
works.

Every step is a dashboard step. Nothing here needs a terminal.

Then open the site and check the board loads.

## Afterwards

Nothing in this file needs doing twice. The seed is one-shot by design, and
the token only wants rotating again if it leaks again.
