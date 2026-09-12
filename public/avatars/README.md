# The five kits

Drop five square pictures in this folder, named exactly:

    1.webp   pink, batter in a helmet
    2.webp   blue, curly hair
    3.webp   purple, beard and glasses
    4.webp   orange
    5.webp   teal, batter in a helmet

96 px square is plenty — they are drawn at 44 px in the picker on the
innings-end card and 28 px in a board row.

Nothing breaks while they are missing, and nothing breaks if one fails to
load. Each kit draws its picture *over* the coloured disc the board has always
drawn, and a picture that will not load takes itself off the page, so the board
degrades to the version of itself it had yesterday rather than to a row of
broken images. There is a test for that.

These are served as files rather than bundled, which is why they live here in
`public/` and not in `src/assets/` — it is what lets the game build and run
whether or not they are present.

**PNG or JPG instead of WebP?** Name them `1.png` … `5.png` and change the one
extension in `src/config/board.ts` (`avatarSrc`). The order above is the order
the kit colours are listed in that same file, so keep them matched.
