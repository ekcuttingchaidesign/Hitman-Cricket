# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Phone players, mostly in India, playing in short sessions: a few innings on a break, on the way home, or because a friend sent a WhatsApp or in-game link. They come for runs, tension and bragging rights, not a tactical simulation. A desktop visitor gets the phone's game in a column.

## Product Purpose

Hitman Cricket is a browser cricket batting game: swipe or press a key to play a stroke at the ball bowled. Modes are the Blast (thirty balls), Super10 (ten overs, five wickets), the Test Marathon and Test Survival, with Rival Matches between two players on the same balls. Success is a player who comes back tomorrow and brings a friend.

Super Knockout is the mode being designed now: a live knockout for up to twelve players batting the same balls at the same time, one wicket each, totals running on, the lowest totals knocked out at the end of every over until two are left, and those two batting the last over, the final, for the higher total.

## Positioning

A real batting game in the browser with no install: the same balls for everybody in a room, so a result between friends is fair and a link is all it takes to play together.

## Operating Context

Played one-handed on a phone, often in a browser opened from WhatsApp or Instagram. Sessions are minutes long. Players share score cards and links in group chats.

## Capabilities and Constraints

- Vite, TypeScript and three.js on the front; Vercel serverless functions over Upstash Redis behind; everything must fit free tiers.
- Super Knockout rules agreed: up to 12 players; one wicket; running total; lowest totals cut each over (wickets count first); five overs, the last the final between the last two (changed 18 November 2026 from sudden death, after a room was won in the fourth over: a cut now takes exactly its count, those out first and the best of them staying on their totals if more are out, so two always reach the final, and the match is settled only in it); a hard tie on the line takes both through; free hit for the over's top 3, tapering as the field shrinks; the Blast's timing windows; Super10's fields.
- Points by real players in the room, and only with 3 or more: 1–2 real = no points; 3 = 3/1/0; 4–5 = 5/2/1; 6–7 = 7/3/1; 8–9 = 8/4/2; 10–12 = 10/5/2. A room of only subs is practice; wins count only with 4+ real players.
- Leaving mid-match gives no place and no points: the result says RAN AWAY.
- The pause is a timeout: your own bowler waits, 15 seconds an over at most; no restart or change mode. Replays are off in this mode.
- Stand-ins fill empty seats and are called subs, never bots or random players.
- Every room is twelve seats: subs fill whatever real players leave empty, so the cuts, the bar and the moments are the same in every match, and a room survives anybody leaving. Points already go by how many real players there are, so a room of three friends and nine subs pays exactly what three alone would. No smaller rooms at launch (decided 17 November 2026); the cuts drawn for three, five and seven (one an over for seven, one at overs 2 and 4 for five, none before sudden death for three) are kept in Figma for a host's Friends only switch, if rooms of five or fewer real players turn out common and hosts ask for it. The final standings may rank the real players among themselves too, so a sub winning the room does not hide who won between friends.
- Leaderboard ladders: Points (default), Wins, Highest total, Win rate; This week and All time.
- Reached from "Play with friends" and a card on Choose a mode; My Stats gets a Knockout card.
- A player id never leaves the store; other players are named by handle.

## Brand Commitments

- Hitman Cricket's UI handover (Figma `JhIdkSdtMSriYe3W5y3NAa`, canvas `125:4590`): Jaro for display, Satoshi for UI (Outfit stands in inside Figma), the orange key, the near-black page.
- Super Knockout's brand sheet (section 32, node `798:6580`): Knockout Red. Red is the knockout, gold is a reward, green only means safe, you are white, never stop the ball.
- Voice: knocked out, never eliminated; sub, never bot; over 1, never round 1; the winner is WINNER, not #1 of 12.

## Evidence on Hand

No real Super Knockout data yet: it is not built. Names, totals and counts in designs are illustrative and must read as such.

## Product Principles

1. Immersion over interruption: what happens to other players moves the ladder and a chip; it never stops your ball.
2. Every ball answers one question at a glance: am I safe or in the drop?
3. Fair and same-balls: nobody wins on luck of the draw.
4. Built to be shared: every result is a picture worth sending to the group.

## Accessibility & Inclusion

Safe and danger must never rely on colour alone (text and position carry them too). Respect reduced motion. Touch targets at least 44 px.
