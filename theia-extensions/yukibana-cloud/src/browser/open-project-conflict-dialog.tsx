/**
 * SPDX-License-Identifier: MIT
 */
import { nls } from '@theia/core';
import { Key, Message } from '@theia/core/lib/browser';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import * as React from 'react';

export enum ConflictResolutionStrategy {
    CANCEL,
    RELOCATE,
    RENAME,
    OPEN,
}

export type ConflictResolution =
    | {
          strategy: ConflictResolutionStrategy.RENAME;
          newName: string;
      }
    | {
          strategy: Exclude<ConflictResolutionStrategy, ConflictResolutionStrategy.RENAME>;
      };

export class OpenProjectConflictDialog extends ReactDialog<ConflictResolution> {
    protected strategy: ConflictResolutionStrategy = ConflictResolutionStrategy.CANCEL;
    protected readonly buttons = new Map<ConflictResolutionStrategy, HTMLButtonElement>();

    constructor(
        protected originalName: string,
        protected newName: string,
    ) {
        super({
            title: nls.localize('yukibana/cloud/openProject/conflictTitle', 'Project already exists'),
        });
        this.appendCloseButton(nls.localize('yukibana/cloud/openProject/conflictCancel', 'Cancel'));
        this.appendStrategyButton(nls.localize('yukibana/cloud/openProject/conflictRelocate', 'Choose another location'), ConflictResolutionStrategy.RELOCATE);
        this.appendStrategyButton(nls.localize('yukibana/cloud/openProject/conflictRename', 'Rename'), ConflictResolutionStrategy.RENAME);
        this.appendStrategyButton(nls.localize('yukibana/cloud/openProject/conflictOpenExisting', 'Open existing'), ConflictResolutionStrategy.OPEN, true);
    }

    protected appendStrategyButton(label: string, strategy: ConflictResolutionStrategy, primary: boolean = false): void {
        const button = this.createButton(label);
        if (primary) {
            button.classList.add('primary');
        } else {
            button.classList.add('secondary');
        }
        this.controlPanel.appendChild(button);
        this.buttons.set(strategy, button);
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        for (const [strategy, button] of this.buttons) {
            this.addKeyListener(button, Key.ENTER, () => this.select(strategy), 'click');
        }
    }

    protected select(strategy: ConflictResolutionStrategy): void {
        this.strategy = strategy;
        this.accept();
    }

    protected render(): React.ReactNode {
        const details = nls.localize(
            'yukibana/cloud/openProject/conflictDetails',
            "A project named '{0}' already exists in this folder. What do you want to do?",
            this.originalName,
        );
        const projectNameLabel = nls.localize('yukibana/cloud/openProject/conflictName', 'Rename to:');
        return (
            <div>
                <p>{details}</p>
                <div>
                    <label>{projectNameLabel}</label>
                    <input type="text" className="theia-input" defaultValue={this.newName} onChange={e => this.handleNameChange(e.target.value)} spellCheck={false} />
                </div>
            </div>
        );
    }

    protected handleNameChange(newName: string): void {
        this.newName = newName;
    }

    get value(): ConflictResolution {
        if (this.strategy === ConflictResolutionStrategy.RENAME) {
            return {
                strategy: this.strategy,
                newName: this.newName,
            };
        }
        return {
            strategy: this.strategy,
        };
    }
}
