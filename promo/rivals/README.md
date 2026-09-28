# Rivals promo

A 15-second 1080×1920 video for the Rivals mode, built with Remotion.
The finished file is `out/rivals-promo.mp4`; `out/rivals-promo-poster.png`
is a still from the banter scene for a thumbnail.

Everything in it comes from the game: the art in `public/art/` and the faces in
`public/avatars/` are copies of the game's own, the fonts are the game's Jaro
and Satoshi, the colours are lifted from `src/styles.css`, and every line of
UI copy (WINNER, LOSER, RUB IT IN, SEND AN EXCUSE, "needs 12 off 4 balls",
the Rivals board columns) is what the real screens say.

## The cut

At 30 fps and 120 BPM a beat is fifteen frames, and every cut lands on one.

| Frames | Scene | What it says |
| --- | --- | --- |
| 0–45 | Hook | Think you're better than your mate? |
| 45–105 | Intro | RIVALS. One link, one match. The link is sent, the mate joins. |
| 105–165 | Live | Bat at the same time; his balls fly across to you as they land. |
| 165–225 | Room | No peeking at scores; up to four in a room. |
| 225–270 | Result | YOU WIN, the flame, the WINNER and LOSER rows. |
| 270–345 | Banter | Split screen: RUB IT IN against SEND AN EXCUSE. |
| 345–405 | Board | The Rivals board; you climb from eighth to first. |
| 405–450 | End card | Send the link. Settle it. |

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
