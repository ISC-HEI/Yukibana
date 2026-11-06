/**
 * SPDX-License-Identifier: MIT
 */
import { nls } from '@theia/core';
import { AbstractDialog } from '@theia/core/lib/browser';

/** What the student chose about their edits to read-only files: undefined when they cancelled. */
export type ReplaceEditsChoice = 'review' | 'replace' | undefined;

/**
 * Asks, every time, before an update replaces a student's edits to read-only files. Replacing is not optional (the
 * teacher's version is the one graded), but it is the student's explicit step, and they can look at their changes
 * first so they can copy anything they want to keep elsewhere.
 */
export class ReplaceEditsDialog extends AbstractDialog<ReplaceEditsChoice> {
    /** The button the student pressed, if one. */
    protected choice: ReplaceEditsChoice;

    /** Creates the dialog about the read-only files at `paths`. */
    constructor(paths: readonly string[]) {
        super({ title: nls.localize('yukibana/cloud/update/replaceTitle', 'Your changes to read-only files will be replaced') });
        const message = document.createElement('div');
        message.textContent = nls.localize(
            'yukibana/cloud/update/replaceMessage',
            "You changed {0}, which your teacher has made read-only. To update, these files must be replaced with your teacher's version, the one that is graded. Review your changes first if you want to copy anything you want to keep somewhere else. Your old version can also still be opened after the update.",
            paths.join(', '),
        );
        this.contentNode.appendChild(message);
        this.closeButton = this.appendCloseButton(nls.localize('yukibana/cloud/update/replaceCancel', 'Not now'));
        this.appendChoice(nls.localize('yukibana/cloud/update/replaceReview', 'Review my changes'), 'review', false);
        this.acceptButton = this.appendChoice(nls.localize('yukibana/cloud/update/replaceOk', 'Replace and update'), 'replace', true);
    }

    /** The student's choice. */
    get value(): ReplaceEditsChoice {
        return this.choice;
    }

    /** Adds a button labelled `label` that closes the dialog with `choice`, highlighted iff `primary`, and returns it. */
    protected appendChoice(label: string, choice: 'review' | 'replace', primary: boolean): HTMLButtonElement {
        const button = this.appendButton(label, primary);
        button.addEventListener('click', () => {
            this.choice = choice;
            this.accept().catch((e: unknown) => console.error(e));
        });
        return button;
    }

    /** Returns `false`, ignoring Enter: an accidental Enter must not replace the student's work. */
    protected override handleEnter(): boolean | void {
        return false;
    }
}
