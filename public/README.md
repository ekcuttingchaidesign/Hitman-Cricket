# The private-window poster

    incognito.webp   "You naughty you — don't try in incognito, play in normal tab"

This is the screen a private window gets instead of the game, and the only place
it is asked for is `src/ui/PrivateNotice.ts`. The file name is the whole
contract: any format a browser reads will do.

It is drawn to fit rather than crop — `object-fit:contain` inside a 420 px
column, capped at 62% of the screen's height — so a tall poster is the right
shape for it and the long side decides the detail. Around 1080 &times; 1920 is
comfortable; anything wider is downscaled and only costs the player bytes.

Nothing breaks if it is not there. The headline it carries is also written out
in the page, set in the game's own type, and it appears the moment the picture
fails to load or is missing. The screen reads the same either way, which is why
this is served from `public/` as a file rather than bundled from `src/assets/`:
a missing poster costs a fallback, not a build.

The picture also carries the whole message, so its `alt` text says the same
sentence for a screen reader.
