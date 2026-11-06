/**
 * SPDX-License-Identifier: MIT
 */
import { nls } from '@theia/core';
import { injectable, interfaces } from '@theia/core/shared/inversify';
import { EditorWidget } from '@theia/editor/lib/browser';
import { MergeEditor } from '@theia/scm/lib/browser/merge-editor/merge-editor';
import { MergeEditorContainerProps, MergeEditorFactory } from '@theia/scm/lib/browser/merge-editor/merge-editor-module';
import { MergeEditorModel } from '@theia/scm/lib/browser/merge-editor/model/merge-editor-model';
import { MergeEditorResultPane } from '@theia/scm/lib/browser/merge-editor/view/merge-editor-panes';
import { MergeEditorPaneToolbarItem } from '@theia/scm/lib/browser/merge-editor/view/merge-editor-panes/merge-editor-pane-header';
import { UPDATE_SCHEME } from '../../common/update-protocol';

/**
 * Theia's merge editor, adjusted for the merges an update opens.
 *
 * Theia's editor expects the result to start as git's file with conflict markers, which it replaces with the
 * original's lines where both sides changed (a "reset", done when the file has a line starting with `<<<<<<<`, and by
 * the Reset button). An update's result is instead the student's real file, with their lines where both sides
 * changed (design §4.2), so two things differ:
 *
 * - A reset would put the original starter's lines over the student's code: it does nothing here, and the button is
 *   gone. Both paths go through {@link MergeEditorModel.reset}, so overriding it is enough.
 * - Theia counts a place as handled when the result differs from the original there, which here is exactly every
 *   place both changed. Those are marked as still to look at once the model is ready.
 *
 * Every other merge (git's) is Theia's, unchanged.
 */

/** Returns `true` iff `editor` is a merge an update opened, that is, its teacher's side is one of our versions. */
export function isUpdateMerge(editor: MergeEditor): boolean {
    return editor.side2Uri.scheme === UPDATE_SCHEME;
}

/** Builds update merges with the parts below, and every other merge as Theia does. */
export class UpdateMergeEditorFactory extends MergeEditorFactory {
    /** Returns the container a merge editor for `props` is built from. */
    protected override createMergeEditorContainer(props: MergeEditorContainerProps): interfaces.Container {
        const child = super.createMergeEditorContainer(props);
        if (props.side2EditorWidget.editor.uri.scheme === UPDATE_SCHEME) {
            child.rebind(MergeEditorModel).to(UpdateMergeEditorModel);
            child.rebind(MergeEditorResultPane).to(UpdateMergeResultPane);
            // Theia binds each pane's editor by the exact class it is injected into
            child.bind(EditorWidget).toConstantValue(props.resultEditorWidget).whenInjectedInto(UpdateMergeResultPane);
        }
        return child;
    }
}

/** The model of an update merge: it never resets its result, and starts with every place both changed to look at. */
@injectable()
export class UpdateMergeEditorModel extends MergeEditorModel {
    /** Sets the model up, then marks the places both changed as still to look at once it is ready. */
    protected override init(): void {
        super.init();
        // After Theia's own first count, which runs before `onInitialized` resolves
        this.onInitialized.then(
            () => this.markConflictsUnhandled(),
            () => undefined,
        );
    }

    /** Does nothing: a reset would write the original starter's lines over the student's file. */
    override async reset(): Promise<void> {}

    /** Marks the places both sides changed differently as still to look at; the result keeps the student's lines. */
    protected markConflictsUnhandled(): void {
        for (const [range, data] of this.mergeRangesDataObservable.get()) {
            if (range.isConflicting) {
                data.isHandledObservable.set(false);
            }
        }
    }
}

/** The result pane of an update merge: no Reset, and the count of places left in the student's words. */
@injectable()
export class UpdateMergeResultPane extends MergeEditorResultPane {
    /** Returns Theia's toolbar items without Reset, and with the count of places left in the student's words. */
    protected override getToolbarItems(): MergeEditorPaneToolbarItem[] {
        const count = this.mergeEditor.model.unhandledMergeRangesCount;
        return super
            .getToolbarItems()
            .filter(item => item.id !== 'reset')
            .map(item =>
                item.id === 'nextConflict'
                    ? {
                          ...item,
                          label:
                              count === 1
                                  ? nls.localize('yukibana/cloud/update/mergeLeftOne', '1 place left to look at')
                                  : nls.localize('yukibana/cloud/update/mergeLeft', '{0} places left to look at', count),
                          tooltip:
                              count === 0
                                  ? nls.localize('yukibana/cloud/update/mergeNoneLeft', 'You looked at every change. Press Done merging to save your file.')
                                  : nls.localize('yukibana/cloud/update/mergeNext', 'Go to the next place'),
                      }
                    : item,
            );
    }
}
