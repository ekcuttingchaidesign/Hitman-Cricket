# The five kits

    avatar_7.png   pink, batter in a helmet
    avatar_1.png   blue, curly hair
    avatar_2.png   purple, beard and glasses
    avatar_3.png   orange
    avatar_6.png   teal, batter in a helmet

That order is the kit order, and it is recorded in `src/config/board.ts` — each
entry names its file and carries a colour sampled off the ring in that picture.
So a replacement picture only has to keep its file name, and a new one only has
to be named there. Nothing is renamed to match an index, which is why the gap in
the numbering costs nothing.

They are drawn at 44 px in the picker on the innings-end card and 28 px in a
board row, so 160 px square is comfortably enough for a high-density screen.

Nothing breaks if one fails to load: each kit draws its picture over a disc of
that picture's own ring colour, and a picture that will not load takes itself
off the page and leaves the disc. In a board row the player's name is written
beside it either way. There is a test for that.

These are served as files rather than bundled, which is why they live here in
`public/` and not in `src/assets/` — it is what lets the game build and run
whether or not they are present.
