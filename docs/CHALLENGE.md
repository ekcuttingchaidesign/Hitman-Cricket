# Rivals: how it works and how to test it

One link is one match room. Whoever opens it joins; whoever taps Play bats;
every ball is written to the room as it happens. Two friends can bat at the
same time and see each other's balls land, or one can bat tonight and the
other on Thursday — the room reads the same either way. Nobody sees a score
until their own last ball.

## The shape of a match

| Moment | What the room shows |
| --- | --- |
| Made, nobody in | You and a dashed "?" seat marked WAITING. SHARE and PLAY NOW. |
| A friend joins | Their face appears beside yours without a tap, JOINED. Either can Play. |
| One has batted, one hasn't | The other sees "batted · 30 balls" and no score. |
| Somebody is batting | A ring round their face fills ball by ball, "batting ball 15 of 30". |
| Both batting at once | Each gets the other's ball flashed between their own, one ball behind. In a group, every rival who has got that far, stacked. |
| One done, one batting | The finished one watches the ring fill and reads "needs 7 off 4 balls". |
| Both done | The result: fire round the winner, WINNER and LOSER rows with sixes, fours and balls. In a group, not until the last innings is in: the fire goes round whoever finished top. The match goes on both records. |
| Declined | "Decline & accept defeat" on the challenge received, or on a row of Rival Matches. Goes down as a loss. |
| A week with no second innings | "This one closed." Innings kept for the career, no result. |
| Started, then left for a day | Forfeit. The one who stayed wins. |
| A third friend on a forwarded link | Joins, bats, and the room becomes a leaderboard. Four seats at most. |
| A fifth on a forwarded link | "Uh oh, late to the party": START A NEW CHALLENGE, or back to mode selection. |

Ties break on runs, then sixes, then fours. Level on all three is a draw.

Each seat bats in its own kit: whoever made the room in the home navy, then
green, purple and blue in the order the others opened the link, and round again
from green for a fifth. The order is fixed when somebody joins, so every phone
agrees on it. `seatKit` in `Challenge.ts` is the rule; the colours are
`BATTER_KITS` in `entities/Batter.ts`, and `?debug=1` exposes
`__cricket.kit('green')` to try one on without a second phone.

## The record

Rival Matches opens on a row of three figures: matches won, lost and drawn,
and the same row sits under the cards on My Stats. It is kept on the server
against the player id, so it follows the career key to a new phone, and it
never expires: rooms go after a month, the record does not.

A match is added when it is over and not before: every innings settled, or
the week gone with at least two in. Top of the room is a win, a shared top a
draw, everything else a loss — walking out and declining included. A group is
one match and one line, not a win over each person under you. A week that ran
out on one innings adds nothing to anybody.

A match that ends on a ball or a decline is counted there and then, for
everybody in it. One that ends on a clock — a forfeit, an expiry — ends while
nobody is looking, so it is caught on the read every phone makes when it opens
Rivals, and settled for everybody in it from there. Either way it is one result
a room, stored against the player (`chro:{playerId}`, room code to a short
string such as `won:47:r` — the result, the runs, and whether it counts on the
board) and overwritten whenever the room says something different. A bare
`won` from before the board existed still reads, as no runs and not counted,
and is written out in full on the next read. The record is a count
of those. It is kept that way rather than as running totals because a finished
room can reopen: a third friend who joins and beats everybody turns a win into
a loss, and a total counted when the room first finished can never be put
right. `outcomeOf` in `challenge-store.ts` is the whole rule; `the record` in
`tests/challenge-store.test.ts` walks it, launch-day case included.

## The Rivals board

The Rivals ranking, behind the trophy key at the top of Rival Matches: matches
won, matches lost, and runs made in them, top fifty, in a sheet of its own over
the list, opened at the player's own row. It sat under the record in the list
for a while, the top ten and a key for the rest, until a playtest asked for it
behind an icon so the matches lead the screen. Ranked on wins, then
fewest losses, then runs. It was a tab on the leaderboard until the Test
Marathon took the room; a ranking of matches sits better beside the matches. It moves the moment a match's last innings lands; nobody
has to open anything.

Every finished match counts, and only a registered name appears — a name
nobody has claimed can be typed by anybody, so a board that showed them would
let two people be the same Rohit. A player who registers after their matches
reaches the board the next time they open Rival Matches, with all of them.

There is a stricter rule, switched off for now: **a match counts only when
somebody else in it has a registered name.** It is what stops a player
climbing the board by playing themselves on a second phone under a made-up
name. It was on at launch, and players whose friends had never registered saw
their wins go on the record and not on the board. It comes back on when there
are enough players for farming to be worth guarding against:
`RIVALS_NEED_REGISTERED_RIVAL` in `src/config/rivals.ts`, one line. Nothing
needs rewriting when it changes — each result is worked out again the next
time anybody in the room opens Rival Matches, and a player left with nothing
that counts is taken off the board. `tests/rivals-rule.test.ts` runs the board
with it on.

Runs are the runs made in the matches that count, a walk-out's included and a
decline's none. Kept as a sorted set (`rvboard`) and a hash of rows
(`rvplayers`), the same two keys every other board is, so the top fifty is two
commands. `GET /api/challenge?board=rivals` reads it, cached at the edge for
thirty seconds. `?demo=1` fills it with fifty made-up records.
`the Rivals board` in `tests/challenge-store.test.ts` walks every rule above.

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
?room=expired    ?room=void   ?room=spectator   ?room=group   ?room=declined
?room=trio       three in, nobody has batted
?room=podium     a group result somebody else won
?room=full       a link opened after all four seats were taken
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
it, both bat, one watches the other finish, both land on the result. Then
Rival Matches, the head-to-head and a rematch, and a third browser opening the
finished room. It runs on the real clock and takes a few minutes.

### Unit tests

`npx vitest run tests/challenge-store.test.ts` covers the rules: codes, cards,
joining, batting a ball at a time, the retry that is never refused, the replay
that always is, forfeit, expiry, the tiebreak, the draw, the void, and the
per-player list.

## Where things live

| File | What it holds |
| --- | --- |
| `src/server/challenge-store.ts` | Every rule: create, join, ball, seen, decline; states; forfeit; expiry; ranking; the record; the Rivals board. |
| `src/server/challenge-endpoint.ts` | The dispatch, shared by `api/challenge.ts` and the dev server. |
| `src/server/name-filter.ts` | The short list of names a friend should not be sent. |
| `src/game/challenge-api.ts` | The calls, the messages, and what the browser keeps. |
| `src/game/Challenge.ts` | The room as one person sees it, the ghosts, polling, the result's words. |
| `src/game/room-demo.ts` | The `?room=` fixtures. |
| `src/ui/HUD.ts` | The picker, the room, the sheets. Search for "The match room". |
| `src/ui/Record.ts` | The won, lost, drawn row, drawn once for Rival Matches and My Stats. |
| `src/ui/RivalsBoard.ts` | The Rivals ranking, in the sheet the trophy key on Rival Matches opens. |
| `src/ui/Lottie.ts` | The player for the films, fetched the first time one is needed. |
| `scripts/lottie-art.mjs` | Draws the films into `public/lotties/`, the looping winner's fire among them. |

## What it costs

Upstash's free tier is half a million commands a month. A match is about
seventy commands with two people batting at once — thirty balls each, a few
joins, and the polls that miss the edge cache — and fewer when they bat apart.
Room reads are the same bytes for everybody and sit in Vercel's edge cache for
two seconds, which is what makes polling affordable. Settling a finished match
onto the board is about five commands a player, once; opening Rival Matches
adds three for a player on the board.
