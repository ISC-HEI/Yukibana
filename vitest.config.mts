/**
 * SPDX-License-Identifier: MIT
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['{packages,theia-extensions}/*/src/**/*.spec.ts'],
        setupFiles: ['./configs/vitest.setup.ts'],
        coverage: {
            provider: 'v8',
            include: ['{packages,theia-extensions}/*/src/**/*.{ts,tsx}'],
            exclude: ['**/*.spec.ts', '**/typings/**'],
            reporter: ['text', 'html', 'lcov'],
        },
    },
});
