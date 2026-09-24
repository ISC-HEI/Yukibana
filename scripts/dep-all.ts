/**
 * SPDX-License-Identifier: MIT
 */
import { execSync } from 'child_process';

function install(dir: string, pkg: string): void {
    const command = `yarn add ${pkg}`;
    console.log(`> ${command}`);
    execSync(command, { stdio: 'inherit', cwd: dir });
}

function uninstall(dir: string, pkg: string): void {
    const command = `yarn remove ${pkg}`;
    console.log(`> ${command}`);
    execSync(command, { stdio: 'inherit', cwd: dir });
}

const funcs: Record<string, (dir: string, pkg: string) => void> = {
    add: install,
    remove: uninstall,
};

execute();

async function execute(): Promise<void> {
    const addOrRemove = process.argv[2];
    const pkg: string = process.argv[3];
    const func = funcs[addOrRemove];
    if (func === undefined) {
        console.error(`Unknown command '${addOrRemove}'. Must be one of ${Object.keys(funcs)}`);
    }

    func('electron-app', pkg);
    func('browser-app', pkg);
    func('theia-extensions/yukibana', pkg);
}
