/**
 * Does each serverless function actually load?
 *
 * `tsc --noEmit` and `vite build` both answer a different question from the one
 * Vercel asks. They type-check, and they resolve modules the way a bundler
 * does — extensionless relative imports and all. Node does not: this package
 * declares `"type": "module"`, so a function is loaded as ESM, and ESM wants an
 * explicit extension on every relative import.
 *
 * Get that wrong and the deployment succeeds, the build is green, and every
 * request dies with FUNCTION_INVOCATION_FAILED before a single line of the
 * handler runs — so there is nothing in the logs that the handler wrote,
 * because the handler never existed. That is what happened, and this is the
 * check that would have caught it.
 *
 * So: transpile `api/` to ESM with no bundler in the way, then actually import
 * each handler in Node and confirm a function came back. Nothing is called, so
 * no credential is needed and no request is made — this asks only whether the
 * module graph resolves.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = mkdtempSync(join(tmpdir(), 'hitman-fn-'));
let failed = 0;

try {
  const handlers = readdirSync('api').filter(name => name.endsWith('.ts'));
  if (!handlers.length) throw new Error('No functions found in api/.');

  // Transpiled the way Node consumes it: real ESM, no bundler resolution.
  execFileSync('npx', [
    'tsc', ...handlers.map(name => `api/${name}`),
    '--outDir', out,
    '--module', 'esnext',
    '--moduleResolution', 'bundler',
    '--target', 'es2022',
    '--skipLibCheck',
  ], { stdio: ['ignore', 'ignore', 'inherit'] });

  // The emitted tree needs to be ESM, which is what the real one is.
  writeFileSync(join(out, 'package.json'), JSON.stringify({ type: 'module' }));
  // And it has to reach the real node_modules for @upstash/redis.
  execFileSync('ln', ['-s', resolve('node_modules'), join(out, 'node_modules')]);

  for (const name of handlers) {
    const built = pathToFileURL(join(out, 'api', name.replace(/\.ts$/, '.js'))).href;
    try {
      const loaded = await import(built);
      if (typeof loaded.default !== 'function') throw new Error('no default export to call');
      console.log(`  ok    api/${name} loads`);
    } catch (error) {
      failed++;
      console.log(`  FAIL  api/${name} does not load`);
      console.log(`        ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (failed) {
  console.error(`\n${failed} function${failed === 1 ? '' : 's'} would crash on every request. `
    + 'A relative import missing its .js extension is the usual cause.\n');
  process.exit(1);
}
