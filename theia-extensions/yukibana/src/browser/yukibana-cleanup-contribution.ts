/**
 * SPDX-License-Identifier: MIT
 */
import { MaybePromise } from '@theia/core';
import { FrontendApplication, FrontendApplicationContribution, Widget } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ConfigStorageProvider } from './config/config-storage-provider';
import { YukibanaConfig } from '../common/yukibana-config';

type WidgetFilter = (id: string, config: YukibanaConfig) => boolean;

/**
 * Contribution to remove some frontend elements
 */
@injectable()
export class CleanupFrontendContribution implements FrontendApplicationContribution {
    private _widgetsToRemove: Array<WidgetFilter> = [
        id => id.startsWith('terminal'),
        id => id.endsWith('metals-explorer'),
        (id, config) => config.features.squiggles === false && (id.endsWith('problems') || id.endsWith('problem-marker-status'))
    ];

    constructor(
        @inject(ConfigStorageProvider) protected readonly configProvider: ConfigStorageProvider
    ) { }

    onDidInitializeLayout(app: FrontendApplication): MaybePromise<void> {
        return this.configProvider.ready.then(config => {
            app.shell.widgets.forEach((widget: Widget) => {
                for (const filter of this._widgetsToRemove) {
                    if (filter(widget.id, config)) {
                        widget.dispose();
                    }
                }
            });
        });
    }
}
