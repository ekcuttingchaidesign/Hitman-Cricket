/// <reference types="vite/client" />

/**
 * The one build-time setting this game has. It is empty when Vercel serves both
 * the game and its endpoints, and set to the API's origin when the game is
 * published somewhere that cannot run them.
 */
interface ImportMetaEnv {
  readonly VITE_BOARD_API?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
