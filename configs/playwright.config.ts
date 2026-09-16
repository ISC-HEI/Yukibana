// *****************************************************************************
// Copyright (C) 2021 logi.cals GmbH, EclipseSource and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

// Taken from https://github.com/eclipse-theia/theia-e2e-test-suite/blob/main/configs/playwright.config.ts

import { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
    testDir: '../tests/lib/',
    testMatch: ['**/*.test.js'],
    workers: 2,
    // Timeout for each test in milliseconds.
    timeout: 60 * 1000,
    use: {
        baseURL: 'http://localhost:3000',
        browserName: 'chromium',
        screenshot: 'only-on-failure',
        viewport: { width: 1920, height: 1080 }
    },
    snapshotDir: '../tests/snapshots',
    expect: {
        toMatchSnapshot: { threshold: 0.15 }
    },
    preserveOutput: 'failures-only',
    reporter: [
        ['list'],
        ['allure-playwright']
    ],
    projects: [
        {
            name: 'Browser',
        },
        {
            name: 'Electron',
        }
    ]
};

export default config;