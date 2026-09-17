/**
 * SPDX-License-Identifier: MIT
 */
import { MaybePromise } from '@theia/core';
import { FrontendApplication, FrontendApplicationContribution, Widget } from '@theia/core/lib/browser';
import { injectable } from '@theia/core/shared/inversify';

/**
 * Contribution to remove some frontend elements
 */
@injectable()
export class CleanupFrontendContribution implements FrontendApplicationContribution {
    onDidInitializeLayout(app: FrontendApplication): MaybePromise<void> {
        app.shell.widgets.forEach((widget: Widget) => {
            if (widget.id.startsWith('terminal')) {
                widget.dispose();
            }
        });
    }
}
