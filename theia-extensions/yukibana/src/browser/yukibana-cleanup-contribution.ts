/**
 * SPDX-License-Identifier: MIT
 */
import { FrontendApplication, FrontendApplicationContribution, Widget } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { YukibanaConfig } from '../common/yukibana-config';
import { ConfigProvider } from './config/config-provider';

type WidgetFilter = (id: string, config: YukibanaConfig) => boolean;

/**
 * Contribution to remove some frontend elements
 */
@injectable()
export class CleanupFrontendContribution implements FrontendApplicationContribution {
    private _widgetsToRemove: Array<WidgetFilter> = [
        id => id.startsWith('terminal'),
        id => id.endsWith('metals-explorer'),
        (id, config) => (config.features.squiggles === false) && (id.endsWith('problems') || id.endsWith('problem-marker-status'))
    ];

    constructor(
        @inject(ConfigProvider) protected readonly configProvider: ConfigProvider
    ) { }

    async onDidInitializeLayout(app: FrontendApplication): Promise<void> {
        const config = await this.configProvider.ready;
        return app.shell.widgets.forEach((widget: Widget) => {
            for (const filter of this._widgetsToRemove) {
                if (filter(widget.id, config)) {
                    widget.dispose();
                }
            }
        });
    }
}
