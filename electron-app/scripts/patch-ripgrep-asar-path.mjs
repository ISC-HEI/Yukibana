// Fixes issue with ripgrep resolving paths inside packaged app
// and failing when searching files in workspace
//
// See https://github.com/eclipse-theia/theia/issues/17825
// Script taken and translated from https://github.com/AkariLabs/akari-video/commit/61b4002861b5d295cd438baa3f11dd1e0b0e8c71
// Thanks @ryoma-nakajima

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const shellRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = path.join(shellRoot, 'electron-app', 'lib', 'backend', 'main.js');

const PATCHED_MARKER = 'app.asar.unpacked$1';
const SHIM_PATTERN = /require\((["'])path\1\)\s*\.\s*join\(\s*__dirname\s*,\s*`\.\/native\/rg\$\{process\.platform\s*===\s*(["'])win32\2\s*\?\s*(["'])\.exe\3\s*:\s*(["'])\4\}`\s*\)/g;

const source = await readFile(target, 'utf8');

if (source.includes(PATCHED_MARKER)) {
  console.log(`[patch-ripgrep-asar-path] Already patched: ${path.relative(shellRoot, target)}`);
  process.exit(0);
}

const matches = source.match(SHIM_PATTERN);
if (!matches || matches.length === 0) {
  console.error(
    '[patch-ripgrep-asar-path] FAILED — rgPath shim not found in lib/backend/main.js\n' +
    'The emit format of @theia/bundle-plugin may have changed (check onLoad(@vscode/ripgrep)\n' +
    'in esbuild-plugin.js and ensure SHIM_PATTERN in this script stays in sync).\n' +
    'If packaged as-is, rgPath would point inside app.asar, breaking file search\n' +
    'in the packaged version across all platforms (issue #5); therefore, the process is aborting here.'
  );
  process.exit(1);
}

const patched = source.replace(
  SHIM_PATTERN,
  match => `(${match}).replace(/\\bapp\\.asar([\\\\/])/, "app.asar.unpacked$1")`
);
await writeFile(target, patched);
console.log(
  `[patch-ripgrep-asar-path] Patched rgPath for asar.unpacked support: ` +
  `${matches.length} occurences (${path.relative(shellRoot, target)})`
);