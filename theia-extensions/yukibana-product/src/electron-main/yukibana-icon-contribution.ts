/**
 * SPDX-License-Identifier: MIT
 */
import { MaybePromise } from '@theia/core';
import { BrowserWindow } from '@theia/core/electron-shared/electron';
import { ElectronMainApplication, ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';
import { injectable } from '@theia/core/shared/inversify';
import * as os from 'os';
import * as path from 'path';

// Taken from https://github.com/eclipse-theia/theia-ide/blob/master/theia-extensions/product/src/electron-main/icon-contribution.ts
@injectable()
export class YukibanaIconContribution implements ElectronMainApplicationContribution {
    onStart(application: ElectronMainApplication): MaybePromise<void> {
        if (os.platform() === 'linux') {
            const windowOptions = application.config.electron.windowOptions;
            if (windowOptions && windowOptions.icon === undefined) {
                const iconPath = path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), '../../resources/icons/WindowIcon/512-512.png');
                windowOptions.icon = iconPath;
                for (const window of BrowserWindow.getAllWindows()) {
                    window.setIcon(iconPath);
                }
            }
        }
    }
}
