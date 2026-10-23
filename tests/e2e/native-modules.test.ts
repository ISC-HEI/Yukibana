/********************************************************************************
 * Copyright (C) 2026 ISC @ HES-SO Valais/Wallis and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';
import { expect, test } from '../src/fixtures';

/** The Electron app's folder. */
const electronApp = path.resolve(__dirname, '..', '..', 'electron-app');

test.describe('Native modules', () => {
    // The Electron app bundles the builds of the native modules that pnpm installs for Node.js, which only load
    // in Electron because they use Node-API. Not every module loads when the app starts, e.g. the terminal's.
    test('should all load in Electron', ({ app }) => {
        test.skip(app !== 'electron', 'The browser app runs them in Node.js, which they are built for');
        const modules = fs.readdirSync(path.join(electronApp, 'lib'), { recursive: true, encoding: 'utf8' })
            .filter(file => file.endsWith('.node'))
            .map(file => path.join(electronApp, 'lib', file))
            // Builds for other platforms, which node-pty ships too.
            .filter(file => !file.includes(`${path.sep}prebuilds${path.sep}`) || file.includes(`${process.platform}-${process.arch}`));
        expect(modules.length).toBeGreaterThan(0);
        const electron = createRequire(path.join(electronApp, 'package.json'))('electron') as string;
        const failures = modules.flatMap(module => {
            // Only the error's message: Electron's own trace includes its whole minified bootstrap code.
            const script = `try { require(${JSON.stringify(module)}) } catch (error) { console.error(error.message); process.exit(1) }`;
            const result = spawnSync(electron, ['-e', script], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' });
            return result.status === 0 ? [] : [`${path.relative(electronApp, module)}: ${(result.stderr || String(result.error)).trim()}`];
        });
        expect(failures).toEqual([]);
    });
});
