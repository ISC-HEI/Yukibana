#!/usr/bin/env node

// Electron's chrome-sandbox helper must be owned by root with the setuid bit
// set, otherwise Electron refuses to start on Linux.

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

if (process.platform !== 'linux') {
    process.exit(0);
}

/** Electron's chrome-sandbox helper in node_modules. */
const DEFAULT_SANDBOX_EXECUTABLE = path.resolve(__dirname, '../../node_modules/electron/dist/chrome-sandbox');
/** The helper to fix: the one given as argument, if any, else Electron's own. */
const sandboxExecutable = process.argv[2] || DEFAULT_SANDBOX_EXECUTABLE;

if (!fs.existsSync(sandboxExecutable)) {
    console.error(`Executable '${sandboxExecutable}' does not exist.`);
    process.exit(1);
}

const stat = fs.statSync(sandboxExecutable);
if (stat.uid === 0 && stat.gid === 0 && (stat.mode & 0o7777) === 0o4755) {
    console.log('chrome-sandbox permissions already correct.');
    process.exit(0);
}

/** Runs `argv` as root, through sudo unless already root, and exits with its status if it fails. */
const run = (...argv) => {
    if (process.getuid() !== 0) {
        argv.unshift('sudo');
    }
    const result = child_process.spawnSync(argv[0], argv.slice(1), { stdio: 'inherit' });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
};

console.log(`Changing permissions and ownership of ${sandboxExecutable}`);
run('chown', 'root:root', sandboxExecutable);
run('chmod', '4755', sandboxExecutable);
