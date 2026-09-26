# Play 1 vs 1: how it works and how to test it

One link is one match room. Whoever opens it joins; whoever taps Play bats;
every ball is written to the room as it happens. Two friends can bat at the
same time and see each other's balls land, or one can bat tonight and the
other on Thursday — the room reads the same either way. Nobody sees a score
until their own last ball.

## The shape of a match

| Moment | What the room shows |
| --- | --- |
| Made, link not sent | "Now make someone regret opening WhatsApp." Invite leads, Play second. |
| Link sent, nobody in | Play leads. A bouncing ball sits in the empty seat. |
| A friend joins | Their row appears without a tap. Either can Play. |
| One has batted, one hasn't | The other sees "batted · 30 balls" and `??` where the score goes. |
| Both batting at once | Each gets the other's ball flashed between their own, one ball behind. |
| One done, one batting | The finished one watches the score climb and reads "needs 7 off 4 balls". |
| Both done | The result, with the trophy, the bails or the crossed bats. |
| A week with no second innings | "This one closed." Innings kept for the career, no result. |
| Started, then left for a day | Forfeit. The one who stayed wins. |
| A third friend on a forwarded link | Joins, bats, and the room becomes a leaderboard. |

Ties break on runs, then sixes, then fours. Level on all three is a draw.

## Testing it

### On the preview

The branch's Vercel preview serves the whole game with its own `preview:`
database keys, so nothing touches the live boards.

- **Two phones, or a phone and a laptop.** Open the preview, Play, tap the big
  card, give a name, send yourself the link on WhatsApp, open it on the other
  device. Everything from the table above can be reached this way.
- **One browser, two identities.** A normal window and a private window are two
  players. A private window cannot count a career, but it can bat in a match.
- **Starting over.** `?fresh=1` clears this browser's player, name and key, and
  asks first. It is how "open the link as somebody new" is done without a
  second phone.
- **The endpoint on its own.** `node scripts/board-check.mjs https://<preview>`
  makes a room, joins it, bats both innings and reads the result back. Point it
  at a preview, never at production.

### Every state on one phone

`?room=<state>` draws one face of the room from a fixture, saves nothing and
touches no server. Useful for looking at copy and layout without a second
person.

```
?room=lobby      empty room, link not yet sent
?room=sent       link gone, nobody joined
?room=both       a friend is in, nobody has batted
?room=chase      they batted, you haven't (score hidden)
?room=live       they are batting now, you haven't started
?room=resume     your own innings left on ball twelve
?room=waiting    your innings in, theirs not
?room=spectate   your innings in, theirs under way
?room=won        ?room=lost   ?room=draw   ?room=forfeit
?room=away       a result found on open, one of two
?room=expired    ?room=void   ?room=spectator   ?room=group
```

The keys on a fixture room do what they always do, which mostly means they
try to reach a room that is not there and say so.

### The two-browser check

```
VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
node scripts/challenge-check.mjs
SHOTS=/tmp/shots node scripts/challenge-check.mjs   # and a screenshot of every screen
```

Two headless browsers: one makes a room and sends the link, the other opens
it, both bat, one watches the other finish, both land on the result. Then the
list, the head-to-head and a rematch, and a third browser opening the finished
room. It runs on the real clock and takes a few minutes.

### Unit tests

`npx vitest run tests/challenge-store.test.ts` covers the rules: codes, cards,
joining, batting a ball at a time, the retry that is never refused, the replay
that always is, forfeit, expiry, the tiebreak, the draw, the void, and the
per-player list.

## Where things live

| File | What it holds |
| --- | --- |
| `src/server/challenge-store.ts` | Every rule: create, join, ball, seen; states; forfeit; expiry; ranking. |
| `src/server/challenge-endpoint.ts` | The dispatch, shared by `api/challenge.ts` and the dev server. |
| `src/server/name-filter.ts` | The short list of names a friend should not be sent. |
| `src/game/challenge-api.ts` | The calls, the messages, and what the browser keeps. |
| `src/game/Challenge.ts` | The room as one person sees it, the ghost, polling, the result's words. |
| `src/game/room-demo.ts` | The `?room=` fixtures. |
| `src/ui/HUD.ts` | The picker, the room, the sheets. Search for "The match room". |
| `src/ui/Lottie.ts` | The player for the films, fetched the first time one is needed. |
| `scripts/lottie-art.mjs` | Draws the films into `public/lotties/`. |

## What it costs

Upstash's free tier is half a million commands a month. A match is about
seventy commands with two people batting at once — thirty balls each, a few
joins, and the polls that miss the edge cache — and fewer when they bat apart.
Room reads are the same bytes for everybody and sit in Vercel's edge cache for
two seconds, which is what makes polling affordable.
