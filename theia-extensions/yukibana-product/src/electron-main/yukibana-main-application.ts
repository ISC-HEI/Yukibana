/**
 * SPDX-License-Identifier: MIT
 */
import { ipcMain } from '@theia/core/electron-shared/electron';
import { CHANNEL_APP_STATE_CHANGED } from '@theia/core/lib/electron-common/electron-api';
import { ElectronMainApplication } from '@theia/core/lib/electron-main/electron-main-application';
import { createDisposableListener } from '@theia/core/lib/electron-main/event-utils';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class YukibanaMainApplication extends ElectronMainApplication {
    /**
     * Theia opens the URL the app was launched with every time its window becomes ready, so again after
     * every reload, e.g. after opening a downloaded project in that window (eclipse-theia/theia#18223).
     */
    protected override showInitialWindow(urlToOpen: string | undefined): void {
        super.showInitialWindow(undefined);
        if (urlToOpen) {
            const listener = createDisposableListener(ipcMain, CHANNEL_APP_STATE_CHANGED, (_event, state) => {
                if (state === 'ready') {
                    listener.dispose();
                    this.openUrl(urlToOpen);
                }
            });
        }
    }
}
