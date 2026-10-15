/**
 * SPDX-License-Identifier: MIT
 */
import { nls } from '@theia/core';
import { DeflatedToolbarTree, ToolbarAlignment } from '@theia/toolbar/lib/browser/toolbar-interfaces';

export const YukibanaToolbarDefaults: () => DeflatedToolbarTree = () => ({
    items: {
        [ToolbarAlignment.LEFT]: [
            [
                {
                    id: 'textEditor.commands.go.back',
                    command: 'textEditor.commands.go.back',
                    icon: 'codicon codicon-arrow-left',
                },
                {
                    id: 'textEditor.commands.go.forward',
                    command: 'textEditor.commands.go.forward',
                    icon: 'codicon codicon-arrow-right',
                },
            ],
            [
                {
                    id: 'metals.run-current-file',
                    command: 'metals.run-current-file',
                    icon: 'codicon codicon-play',
                },
            ],
        ],
        [ToolbarAlignment.CENTER]: [
            []
        ],
        [ToolbarAlignment.RIGHT]: [
            [
                {
                    id: 'yukibana.submitAssignment',
                    command: 'yukibana.submitAssignment',
                    icon: 'codicon codicon-send',
                    tooltip: nls.localize('yukibana/submission/submitAssignment', 'Submit assignment...'),
                },
            ]
        ],
    }
});
