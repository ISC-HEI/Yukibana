/**
 * SPDX-License-Identifier: MIT
 */
import { Command, CommandRegistry, nls } from '@theia/core';
import { AbstractViewContribution, codicon, ConfirmDialog, FrontendApplicationContribution, StatusBar, StatusBarAlignment, Widget } from '@theia/core/lib/browser';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MergeEditor } from '@theia/scm/lib/browser/merge-editor/merge-editor';
import { AssignmentUpdates } from './assignment-updates';
import { isUpdateMerge } from './update-merge-editor';
import { statusText } from './update-texts';
import { UpdateWidget } from './update-widget';

/** The commands of assignment updates. */
export namespace UpdateCommands {
    const CATEGORY = 'Yukibana';
    /** Shows the view and checks for an update now. */
    export const CHECK = Command.toLocalizedCommand(
        { id: 'yukibana.update.check', label: 'Check for Assignment Updates', category: CATEGORY },
        'yukibana/cloud/update/checkCommand',
    );
    /** Undoes the last update. */
    export const UNDO = Command.toLocalizedCommand({ id: 'yukibana.update.undo', label: 'Undo Last Assignment Update', category: CATEGORY }, 'yukibana/cloud/update/undoCommand');
    /** The visible way to finish a merge an update opened: saves the result, closes the editor, settles the row. */
    export const FINISH_MERGE = Command.toLocalizedCommand({ id: 'yukibana.update.finishMerge', label: 'Done Merging' }, 'yukibana/cloud/update/finishMerge');
}

const STATUS_ID = 'yukibana-assignment-update';

/** Returns `widget` if it is a merge editor an update opened, and `undefined` otherwise. */
function updateMergeEditor(widget: Widget | undefined): MergeEditor | undefined {
    return widget instanceof MergeEditor && isUpdateMerge(widget) ? widget : undefined;
}

/** The view, its commands, the status bar item, and the merge editor's Done button. */
@injectable()
export class UpdateContribution extends AbstractViewContribution<UpdateWidget> implements FrontendApplicationContribution, TabBarToolbarContribution {
    @inject(AssignmentUpdates) protected readonly updates!: AssignmentUpdates;
    @inject(StatusBar) protected readonly statusBar!: StatusBar;

    /** Creates the contribution of the view, in the left side panel. */
    constructor() {
        super({
            widgetId: UpdateWidget.ID,
            widgetName: UpdateWidget.LABEL,
            defaultWidgetOptions: { area: 'left', rank: 600 },
            toggleCommandId: 'yukibana.update.show',
        });
    }

    /** Keeps the status bar item in step with the state, and shows the view when asked to. */
    onStart(): void {
        this.updates.onDidChange(state => {
            const entry = statusText(state);
            if (entry === undefined) {
                this.statusBar.removeElement(STATUS_ID);
                return;
            }
            this.statusBar.setElement(STATUS_ID, { ...entry, alignment: StatusBarAlignment.LEFT, priority: 50, onclick: () => this.openView({ activate: true, reveal: true }) });
        });
        this.updates.onShow(() => this.openView({ activate: true, reveal: true }));
    }

    /** Registers the view's command and the commands of {@link UpdateCommands} with `commands`. */
    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        // Also the view's toolbar buttons: shown on the view, and in the palette (called without a widget)
        const onView = (widget?: unknown): boolean => widget === undefined || widget instanceof UpdateWidget;
        commands.registerCommand(UpdateCommands.CHECK, {
            execute: async () => {
                await this.openView({ activate: true, reveal: true });
                await this.updates.refresh();
            },
            isVisible: onView,
        });
        commands.registerCommand(UpdateCommands.UNDO, {
            execute: () => this.updates.undo().catch((e: unknown) => this.updates.reportFailure(e)),
            isEnabled: () => this.updates.state.last !== undefined,
            isVisible: onView,
        });
        commands.registerCommand(UpdateCommands.FINISH_MERGE, {
            execute: async (widget?: Widget) => {
                const editor = this.mergeEditorOf(widget);
                if (editor === undefined) {
                    return;
                }
                // Not Theia's Complete Merge: its question speaks of conflicts, and what is left here is the student's own lines
                const left = editor.model.unhandledMergeRangesCount;
                if (left > 0) {
                    const ok = await new ConfirmDialog({
                        title: nls.localize('yukibana/cloud/update/finishTitle', 'Finish merging?'),
                        msg: nls.localize(
                            'yukibana/cloud/update/finishLeft',
                            "You have not looked at {0} of the places your teacher changed. Your file keeps what the result shows: where you did not take your teacher's change, your own version stays.",
                            left,
                        ),
                        ok: nls.localize('yukibana/cloud/update/finishOk', 'Finish'),
                    }).open();
                    if (!ok) {
                        return;
                    }
                }
                await editor.model.resultDocument.save();
                const row = this.updates.pendingAt(editor.resultUri);
                editor.close();
                if (row !== undefined) {
                    await this.updates.resolve(row, 'merged');
                }
            },
            isVisible: (widget?: Widget) => this.mergeEditorOf(widget) !== undefined,
            isEnabled: (widget?: Widget) => this.mergeEditorOf(widget) !== undefined,
        });
    }

    /** Returns the update merge editor a command is about: `widget`, whose toolbar it is in, or else the current one. */
    protected mergeEditorOf(widget: Widget | undefined): MergeEditor | undefined {
        return updateMergeEditor(widget) ?? updateMergeEditor(this.shell.currentWidget);
    }

    /** Puts Check and Undo on the view's toolbar, and Done merging on an update merge editor's. */
    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: `${UpdateCommands.CHECK.id}.toolbar`,
            command: UpdateCommands.CHECK.id,
            icon: codicon('refresh'),
            tooltip: nls.localize('yukibana/cloud/update/checkNow', 'Check for updates'),
            priority: 1,
        });
        registry.registerItem({
            id: `${UpdateCommands.UNDO.id}.toolbar`,
            command: UpdateCommands.UNDO.id,
            icon: codicon('discard'),
            tooltip: nls.localize('yukibana/cloud/update/undo', 'Undo update'),
            priority: 0,
        });
        registry.registerItem({
            id: UpdateCommands.FINISH_MERGE.id,
            command: UpdateCommands.FINISH_MERGE.id,
            text: nls.localize('yukibana/cloud/update/finishMergeButton', 'Done merging'),
            tooltip: nls.localize('yukibana/cloud/update/finishMergeTooltip', 'Save the result into your file and close the merge'),
            group: 'navigation',
            order: '0',
        });
    }
}
