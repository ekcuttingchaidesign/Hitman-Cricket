# The private-window poster

    incognito.webp   "You naughty you — don't try in incognito, play in normal tab"

This is the screen a private window gets instead of the game, and the only place
it is asked for is `src/ui/PrivateNotice.ts`. The file name is the whole
contract: any format a browser reads will do.

It is the screen rather than a picture on one. The frame it fills is nine by
sixteen, or the window, whichever runs out first — edge to edge on a phone, a
tall plate on the game's navy on a wide screen — and the picture fills that
frame, so a portrait poster is the shape to draw. Around 1080 &times; 1920 is
comfortable; anything larger is downscaled and only costs the player bytes.
Keep the lower fifth quiet: the two keys stand over it, under a scrim.

The poster carries the words, so the page adds none. Its `alt` text says the
same sentence for a screen reader.

Nothing breaks if it is not there. The headline it carries is also written out
in the page, hidden, set in the game's own type, and it takes the poster's place
the moment the picture fails to load or is missing. That is why this is served
from `public/` as a file rather than bundled from `src/assets/`: a missing
poster costs a fallback, not a build.
