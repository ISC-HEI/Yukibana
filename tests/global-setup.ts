/**
 * SPDX-License-Identifier: MIT
 */
import { execFileSync } from 'child_process';
import * as path from 'path';

/** The build CLI's script. */
const cli = path.resolve(__dirname, '..', 'scripts', 'cli.mts');

/** Builds both apps in development mode, and downloads the plugins unless they are up to date. */
export default function globalSetup(): void {
    for (const command of [['build', '--dev'], ['download:plugins']]) {
        execFileSync(process.execPath, [cli, ...command], { stdio: 'inherit' });
    }
}
