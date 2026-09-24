/**
 * SPDX-License-Identifier: MIT
 */
import { execSync } from 'child_process';

execute();

async function execute(): Promise<void> {
    const pkg: string = process.argv[2];

    console.log(`Installing ${pkg}...`);
    install('electron-app', pkg);
    install('browser-app', pkg);
    install('theia-extensions/yukibana', pkg);
}

function install(dir: string, pkg: string): void {
    const command = `yarn add ${pkg}`;
    console.log(`> ${command}`);
    execSync(command, { stdio: 'inherit', cwd: dir });
}
