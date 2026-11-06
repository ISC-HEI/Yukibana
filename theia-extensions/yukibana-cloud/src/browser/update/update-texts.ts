/**
 * SPDX-License-Identifier: MIT
 */
import { nls } from '@theia/core';
import { localizeMarkdown } from 'yukibana-common/lib/localize-markdown';
import { AvailableUpdate, DecidedRow, UpdateRow, UpdateState } from '../../common/update-protocol';

/**
 * Every sentence the update shows a student, in one place, so that they use the same few words: "your version", "your
 * teacher's version", "update", "merge". Git's vocabulary (base, theirs, conflict, input 1) stays out.
 */

/** Returns the rows of `rows` whose update replaces the student's edits to a read-only file. */
export function replacesEdits(rows: readonly DecidedRow[]): DecidedRow[] {
    return rows.filter(r => r.protected && r.editedByStudent);
}

/** Returns "1 file" or "`n` files". */
export function files(n: number): string {
    return n === 1 ? nls.localize('yukibana/cloud/update/oneFile', '1 file') : nls.localize('yukibana/cloud/update/files', '{0} files', n);
}

/** Returns the notification announcing `update`, saying what it would do. */
export function notification(update: AvailableUpdate): string {
    const lines = [localizeMarkdown('yukibana/cloud/update/published', 'Your teacher updated "{0}".', update.projectTitle)];
    const toUpdate = update.decided.length;
    const replaced = replacesEdits(update.decided).length;
    if (toUpdate > 0) {
        lines.push(
            replaced > 0
                ? nls.localize(
                      'yukibana/cloud/update/willUpdateSomeEdited',
                      '{0} will be updated, and your changes to {1} of them will be replaced because they are read-only.',
                      files(toUpdate),
                      replaced,
                  )
                : nls.localize('yukibana/cloud/update/willUpdate', '{0} will be updated; you have not changed any of them.', files(toUpdate)),
        );
    }
    if (update.pending.length > 0) {
        lines.push(
            nls.localize(
                'yukibana/cloud/update/willMerge',
                "You and your teacher both changed {0}. Yours will be kept, and you can merge in your teacher's changes afterwards.",
                files(update.pending.length),
            ),
        );
    }
    return lines.join(' ');
}

/** Returns the label of the button that applies `update`. */
export function updateButton(update: AvailableUpdate): string {
    const n = update.decided.length;
    return n === 0 ? nls.localize('yukibana/cloud/update/updateButton', 'Update') : nls.localize('yukibana/cloud/update/updateNFiles', 'Update {0}', files(n));
}

/**
 * Returns what happens to `row`'s file, in a few words.
 *
 * The same words serve before and after an update (the view shows both), so they say what each side has, not when.
 */
export function describe(row: UpdateRow): string {
    switch (row.kind) {
        case 'write':
            if (row.editedByStudent) {
                return nls.localize('yukibana/cloud/update/replacesYours', "read-only: your teacher's version replaces your changes");
            }
            if (!row.present) {
                return nls.localize('yukibana/cloud/update/newFile', 'new file');
            }
            return row.newlyProtected ? nls.localize('yukibana/cloud/update/nowReadOnly', 'changed, now read-only') : nls.localize('yukibana/cloud/update/changed', 'changed');
        case 'delete':
            return nls.localize('yukibana/cloud/update/removed', 'removed by your teacher');
        case 'merge':
            return nls.localize('yukibana/cloud/update/bothChanged', "you both changed it; your version stays, and you merge in your teacher's changes");
        case 'choose':
            switch (row.reason) {
                case 'deletedByTeacher':
                    return nls.localize('yukibana/cloud/update/deletedByTeacher', 'your teacher removed it; you changed it');
                case 'deletedByStudent':
                    return nls.localize('yukibana/cloud/update/deletedByStudent', 'you deleted it; your teacher changed it');
                case 'bothAdded':
                    return nls.localize('yukibana/cloud/update/bothAdded', 'you and your teacher both created this file');
                case 'binary':
                    return nls.localize('yukibana/cloud/update/binary', 'you and your teacher both changed it, and it cannot be merged line by line');
            }
    }
}

/** Returns the status bar entry for `state`: an update to apply, files still to merge, or `undefined` for none. */
export function statusText(state: UpdateState): { text: string; tooltip: string } | undefined {
    if (state.available) {
        return {
            text: `$(cloud-download) ${nls.localize('yukibana/cloud/update/statusAvailable', 'Assignment update')}`,
            tooltip: nls.localize('yukibana/cloud/update/statusAvailableTooltip', 'Your teacher published a new version of this assignment'),
        };
    }
    const pending = state.last?.pending.length ?? 0;
    if (pending > 0) {
        return {
            text: `$(git-merge) ${pending === 1 ? nls.localize('yukibana/cloud/update/statusOneToMerge', '1 file to merge') : nls.localize('yukibana/cloud/update/statusToMerge', '{0} files to merge', pending)}`,
            tooltip: nls.localize('yukibana/cloud/update/statusToMergeTooltip', 'Files you and your teacher both changed in the last assignment update'),
        };
    }
    return undefined;
}

/** How a row looks in the view: a letter in a colour, as source control shows files, with words for the hover. */
export interface Badge {
    /** One letter: A, M, D, or ! for a file both changed. */
    readonly letter: string;
    /** The colour, as the name of one of Theia's git decoration colours, which the theme already sets. */
    readonly kind: 'added' | 'modified' | 'deleted' | 'conflict';
    /** What the letter means, for the hover and screen readers. */
    readonly label: string;
}

/** Returns how `row` looks in the view. */
export function badge(row: UpdateRow): Badge {
    switch (row.kind) {
        case 'write':
            return row.present
                ? { letter: 'M', kind: 'modified', label: nls.localize('yukibana/cloud/update/badgeModified', 'Changed by your teacher') }
                : { letter: 'A', kind: 'added', label: nls.localize('yukibana/cloud/update/badgeAdded', 'New file from your teacher') };
        case 'delete':
            return { letter: 'D', kind: 'deleted', label: nls.localize('yukibana/cloud/update/badgeDeleted', 'Removed by your teacher') };
        case 'merge':
        case 'choose':
            return { letter: '!', kind: 'conflict', label: nls.localize('yukibana/cloud/update/badgeBoth', 'Changed by you and your teacher') };
    }
}
