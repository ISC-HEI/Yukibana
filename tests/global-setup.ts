/**
 * SPDX-License-Identifier: MIT
 */
import { execFileSync } from 'child_process';
import * as path from 'path';

const cli = path.resolve(__dirname, '..', 'scripts', 'cli.mts');

/** Builds the apps and downloads the plugins, both skipped when already up to date. */
export default function globalSetup(): void {
    for (const command of [['build', '--dev'], ['download:plugins']]) {
        execFileSync(process.execPath, [cli, ...command], { stdio: 'inherit' });
    }
}
