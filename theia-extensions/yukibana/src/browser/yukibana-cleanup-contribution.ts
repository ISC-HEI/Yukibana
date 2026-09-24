/**
 * SPDX-License-Identifier: MIT
 */
import { MaybePromise } from '@theia/core';
import { FrontendApplication, FrontendApplicationContribution, Widget } from '@theia/core/lib/browser';
import { injectable } from '@theia/core/shared/inversify';

type WidgetFilter = (id: string) => boolean;

/**
 * Contribution to remove some frontend elements
 */
@injectable()
export class CleanupFrontendContribution implements FrontendApplicationContribution {
    private _widgetsToRemove: Array<WidgetFilter> = [
        id => id.startsWith('terminal'),
        id => id.endsWith('metals-explorer'),
    ];

    onDidInitializeLayout(app: FrontendApplication): MaybePromise<void> {
        app.shell.widgets.forEach((widget: Widget) => {
            for (const filter of this._widgetsToRemove) {
                if (filter(widget.id)) {
                    widget.dispose();
                }
            }
        });
    }
}
