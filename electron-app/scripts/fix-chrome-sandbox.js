#!/usr/bin/env node

// Electron's chrome-sandbox helper must be owned by root with the setuid bit
// set, otherwise Electron refuses to start on Linux.

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

// Only run on Linux
if (process.platform !== 'linux') {
    process.exit(0);
}

const DEFAULT_SANDBOX_EXECUTABLE = path.resolve(__dirname, '../../node_modules/electron/dist/chrome-sandbox');
const sandboxExecutable = process.argv[2] ?? DEFAULT_SANDBOX_EXECUTABLE;

if (!fs.existsSync(sandboxExecutable)) {
    console.error(`Executable '${sandboxExecutable}' does not exist.`);
    process.exit(1);
}

const stat = fs.statSync(sandboxExecutable);
if (stat.uid === 0 && stat.gid === 0 && (stat.mode & 0o7777) === 0o4755) {
    console.log('chrome-sandbox permissions already correct.');
    process.exit(0);
}

const run = (command, args) => {
    const sudo = process.getuid() !== 0;
    const result = sudo
        ? child_process.spawnSync('sudo', [command, ...args], { stdio: 'inherit' })
        : child_process.spawnSync(command, args, { stdio: 'inherit' });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
};

console.log(`Changing permissions and ownership of ${sandboxExecutable}`);
run('chown', ['root:root', sandboxExecutable]);
run('chmod', ['4755', sandboxExecutable]);
