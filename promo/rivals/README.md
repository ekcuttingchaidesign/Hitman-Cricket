# Rivals promo

An 18-second 1080×1920 video for the Rivals mode, built with Remotion.
The finished file is `out/rivals-promo.mp4`; `out/rivals-promo-poster.png`
is a still from the banter scene for a thumbnail.

Everything in it comes from the game: the art in `public/art/` and the faces in
`public/avatars/` are copies of the game's own, the fonts are the game's Jaro
and Satoshi, the colours are lifted from `src/styles.css`, and every line of
UI copy (WINNER, LOSER, RUB IT IN, SEND AN EXCUSE, "needs 12 off 4 balls",
the Rivals board columns) is what the real screens say.

## The cut

At 30 fps and 100 BPM a beat is eighteen frames, and every cut lands on one.

| Seconds | Scene | What it says |
| --- | --- | --- |
| 0–1.8 | Hook | Think you're better than your mate? |
| 1.8–4.2 | Intro | RIVALS. One link, one match. The link is sent, the mate joins. |
| 4.2–6.6 | Live | Bat at the same time; his balls fly across to you as they land. |
| 6.6–9.0 | Room | No peeking at scores; up to four in a room. |
| 9.0–10.8 | Result | YOU WIN, the flame, the WINNER and LOSER rows. |
| 10.8–13.8 | Banter | Split screen: RUB IT IN against SEND AN EXCUSE. |
| 13.8–16.2 | Board | The Rivals board; you climb from eighth to first. |
| 16.2–18.0 | End card | Send the link. Settle it. |

## The pace

The scenes are timed in fifteen-frame beats, the first cut's, and read their
clock through `useSceneFrame` in `src/lib.ts`. `STRETCH` there sets the pace of
everything at once: 1 is the original 15-second, 120 BPM cut, 1.2 is this one.
Change it together with `LEN` and `BEAT` in `scripts/gen-audio.mjs` so the
music keeps the same beat grid.

The transitions are match cuts: the camera dives into the gap between the
helmets and VS comes out of it; the two faces stay put across three scenes;
your face lifts into the winner's spot; the result rows split the screen; a
fireball wipes into the board; your crowned face lifts out of the board into
the end card. Shared positions live in `at` in `src/theme.ts`.

## Rebuilding it

    npm install
    npm run sfx       # synthesises the music and effects into public/sfx/
    npm run studio    # scrub it in the browser
    npm run render    # writes out/rivals-promo.mp4

In a container without a downloadable Chrome, pass one explicitly:

    npx remotion render src/index.ts RivalsPromo out/rivals-promo.mp4 --codec h264 --crf 16 \
      --browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell

`node scripts/sheet.mjs out/rivals-promo.mp4 out/check/a.png 10 40 90 …` tiles
frames from the render onto one image, which is how each pass was checked.

This folder is its own package; nothing in the game builds or tests it.
