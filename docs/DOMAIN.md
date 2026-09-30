# Moving to hitmancricket.in

The game moves from `hitman-cricket.vercel.app` to **hitmancricket.in**, a
domain bought on GoDaddy and served by the same Vercel project. Same
deployment, same database, same boards: only the address changes.

The old address forwards to the new one — but from the page, not from Vercel's
settings, and the order below matters because of it. Who a player is lives in
their browser, per address: on a new address the same phone is a new player
with no name and no career. So the page on the old address packs up what the
game keeps and hands it to the new one on the way (`src/game/new-home.ts`). A
redirect set in Vercel would send people on before the page ever ran, and every
one of them would arrive a stranger.

## 1. Add the domain in Vercel

Vercel → the `hitman-cricket` project → **Settings → Domains** → **Add**:

- `hitmancricket.in`, for **Production**.
- `www.hitmancricket.in` as well — Vercel offers to add it and to redirect it
  to `hitmancricket.in`. Take both. (That redirect is fine: nobody has a career
  on `www` yet.)

Vercel then shows the DNS records each one needs. Keep that page open.

**Leave `hitman-cricket.vercel.app` where it is, and do not give it a redirect
in this screen.** See above: it has to keep serving the page that does the
handing over.

## 2. Point the domain at Vercel in GoDaddy

GoDaddy → **My Products** → `hitmancricket.in` → **DNS** (Manage DNS):

1. Remove what GoDaddy put there by default: the `A` record for `@` that
   points at their parking page, and any **Forwarding** set up for the domain.
2. Add the records Vercel showed, exactly as it shows them. They are usually:

   | Type  | Name  | Value                  |
   |-------|-------|------------------------|
   | A     | `@`   | `76.76.21.21`          |
   | CNAME | `www` | `cname.vercel-dns.com` |

   If Vercel's page shows different values for this project, use Vercel's.
3. TTL: the default is fine.

## 3. Wait for Vercel to say it is ready

Back on Vercel's Domains page, both entries go to **Valid Configuration** once
the DNS has spread — minutes, occasionally a few hours — and Vercel issues the
certificate by itself. Then open **https://hitmancricket.in** and check the game
is there and the board loads. It is the same production deployment, so it
should look exactly like the old address.

**Do not merge until this works.** The forwarding ships with the code, and
the moment it is live the old address sends everybody to the new one; if the
new one is not answering yet, that is everybody sent to nothing.

## 4. Merge

Merge the branch carrying `new-home.ts` into `codex/cricket-batting-game`.
When the deploy finishes, opening the old address — the link people have
bookmarked and shared — lands on hitmancricket.in, on the same page, as the same
player.

`scripts/move-check.mjs` checks all three ways in against a dev server: a
player with a career arrives as themselves, a newcomer arrives with nothing,
and a link carrying somebody else's career is refused.

## 5. Afterwards

- **GoatCounter.** If the site has any allowed-domains setting, add
  `hitmancricket.in`, or the new address counts nothing.
- **Links you share.** Share `https://hitmancricket.in` from now on. The old
  one keeps working, forever if the project keeps it.
- **Keep the old domain attached** to the project. It costs nothing, and it is
  the only thing that moves a player who has not been back since.

## What does not move

A browser that has already been to hitmancricket.in and become a player there
before it next opens the old address is kept as that player: the two are not
spliced together. The career on the old address is still on the board, and the
career key brings it back — the restore screen is there for exactly this.
