/**
 * SPDX-License-Identifier: MIT
 */
import { defineConfig } from '@playwright/test';
import type { App } from './src/fixtures';

/** The end-to-end tests, as a `browser` and an `electron` project. */
export default defineConfig<{}, { app: App }>({
    testDir: 'e2e',
    globalSetup: './global-setup.ts',
    timeout: 60 * 1000,
    workers: process.env.CI ? 1 : 2,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'on-failure' }]],
    projects: [
        { name: 'browser', use: { app: 'browser' } },
        // The Electron app is single-instance: a second one quits.
        { name: 'electron', use: { app: 'electron' }, workers: 1 },
    ],
});
