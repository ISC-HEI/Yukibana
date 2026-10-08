/**
 * SPDX-License-Identifier: MIT
 */
import { AbstractViewContribution } from '@theia/core/lib/browser';
import { injectable } from '@theia/core/shared/inversify';
import { AssignmentPaneWidget } from './assignment-pane-widget';

@injectable()
export class AssignmentPaneContribution extends AbstractViewContribution<AssignmentPaneWidget> {
    constructor() {
        super({
            widgetId: AssignmentPaneWidget.ID,
            widgetName: AssignmentPaneWidget.LABEL,
            defaultWidgetOptions: { area: 'left' },
            toggleCommandId: 'yukibana.assignmentPane.toggle'
        });
    }
}
