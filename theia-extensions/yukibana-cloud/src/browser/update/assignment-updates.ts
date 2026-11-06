/**
 * SPDX-License-Identifier: MIT
 */
import { Emitter, ILogger, MessageService, nls, URI } from '@theia/core';
import { ConfirmDialog, FrontendApplicationContribution, open, OpenerService, StorageService } from '@theia/core/lib/browser';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { EditorManager } from '@theia/editor/lib/browser';
import { MergeEditorOpenerOptions, MergeEditorUri } from '@theia/scm/lib/browser/merge-editor/merge-editor';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { localizeMarkdown } from 'yukibana-common/lib/localize-markdown';
import { messageOf } from '../../common/errors';
import {
    AvailableUpdate,
    DecidedRow,
    LastUpdate,
    NO_UPDATE,
    PendingRow,
    Resolution,
    UpdateRow,
    UpdateService,
    UpdateSide,
    UpdateState,
    UpdateUri,
} from '../../common/update-protocol';
import { ReplaceEditsDialog } from './replace-edits-dialog';
import { UpdateCheck } from './update-check';
import { files, notification, updateButton } from './update-texts';
import { nextCheckIn } from './update-schedule';

/** Returns the title the merge and diff editors give the student's side. Every screen uses these words. */
export const YOUR_VERSION = (): string => nls.localize('yukibana/cloud/update/yourVersion', 'Your version');
/** Returns the title the merge and diff editors give the teacher's side. */
export const TEACHERS_VERSION = (): string => nls.localize('yukibana/cloud/update/teachersVersion', "Teacher's version");

/** A version of a file: one the backend reads (see {@link UpdateSide}), or `'file'`, the student's real file. */
type Version = UpdateSide | 'file';

/** The workspace folder a check was about, and what the backend said about it. */
interface Checked {
    /** The folder's URI. */
    readonly root: URI;
    /** What the backend said about it. */
    readonly state: UpdateState;
}

/**
 * The frontend's side of assignment updates: when to ask, what to tell the student, and which editors to open.
 *
 * It asks the backend when the workspace opens, every five minutes (every minute in the two hours before the
 * deadline), when a window whose check is overdue regains focus, and when asked (the command, the submit dialog). A
 * newer release is announced once per release and folder; the status bar item and the view stay until it is applied,
 * so "Later" never loses it.
 *
 * The actions on rows (compare, merge, resolve) are offered only for what the state shows, and each says in a
 * `Requires:` which part of the state it needs; calling one without it throws.
 */
@injectable()
export class AssignmentUpdates implements FrontendApplicationContribution, UpdateCheck {
    @inject(UpdateService) protected readonly service!: UpdateService;
    @inject(WorkspaceService) protected readonly workspaces!: WorkspaceService;
    @inject(MessageService) protected readonly messages!: MessageService;
    @inject(StorageService) protected readonly storage!: StorageService;
    @inject(OpenerService) protected readonly openers!: OpenerService;
    @inject(EditorManager) protected readonly editors!: EditorManager;
    @inject(ILogger) @named('yukibana:Update') protected readonly logger!: ILogger;

    protected readonly onDidChangeEmitter = new Emitter<UpdateState>();
    /** Fires with the new state whenever it changes. */
    readonly onDidChange = this.onDidChangeEmitter.event;
    protected readonly onShowEmitter = new Emitter<void>();
    /** Fires when something asks to see the update view: a notification button, or an update left files to merge. */
    readonly onShow = this.onShowEmitter.event;

    /** The last check's folder and answer; `undefined` while no workspace is open. */
    protected checked: Checked | undefined;
    /** When the last check started, in ms since the epoch; 0 before the first. */
    protected lastCheck = 0;
    /** The timer of the next scheduled check. */
    protected timer: number | undefined;
    /** The check in progress, if one is. */
    protected running: Promise<UpdateState> | undefined;

    /** The state of the workspace folder, as last checked. */
    get state(): UpdateState {
        return this.checked?.state ?? NO_UPDATE;
    }

    /** Checks once the workspace is open, and again whenever it changes or an overdue window regains focus. */
    async onStart(): Promise<void> {
        await this.workspaces.ready;
        this.workspaces.onWorkspaceChanged(() => this.refresh());
        // Browsers slow timers in a hidden window; a window that comes back checks if its check is overdue
        window.addEventListener('focus', () => {
            if (Date.now() - this.lastCheck >= nextCheckIn(this.lastCheck, this.state.deadline)) {
                this.refresh();
            }
        });
        this.refresh();
    }

    /** Checks the workspace folder again and returns its state; never rejects. One check runs at a time. */
    refresh(): Promise<UpdateState> {
        if (this.running === undefined) {
            this.running = this.check().finally(() => {
                this.running = undefined;
                this.schedule();
            });
        }
        return this.running;
    }

    /** Asks the view to show itself. */
    show(): void {
        this.onShowEmitter.fire();
    }

    /**
     * Applies the available update: saves the files it touches, asks before replacing edits to read-only files, writes.
     *
     * - Requires: `state.available` is set.
     */
    async update(): Promise<void> {
        const { root, available } = this.requireAvailable();
        const rows = [...available.decided, ...available.pending];
        await this.saveOpenEditors(root, rows);
        let result = await this.service.update(root.toString(), available.to, []);
        if (result.kind === 'confirm') {
            // Replacing is required, but always the student's explicit step, with a chance to look at their changes first
            const paths = result.paths;
            const choice = await new ReplaceEditsDialog(paths).open();
            if (choice === 'review') {
                this.show();
                for (const row of available.decided.filter(r => paths.includes(r.path))) {
                    await this.reviewOwnChanges(row);
                }
                return;
            }
            if (choice !== 'replace') {
                return;
            }
            result = await this.service.update(root.toString(), available.to, paths);
        }
        if (result.kind === 'failed') {
            this.messages.error(localizeMarkdown('yukibana/cloud/update/failed', 'The update did not happen: {0}', result.reason));
            return;
        }
        if (result.kind === 'confirm') {
            // Something changed between the two calls; the view shows the new plan
            await this.refresh();
            return;
        }
        const toMerge = this.set({ root, state: result.state }).last?.pending.length ?? 0;
        const undo = nls.localize('yukibana/cloud/update/undo', 'Undo update');
        const message =
            toMerge === 0
                ? nls.localize('yukibana/cloud/update/done', "Your project is up to date with your teacher's version.")
                : nls.localize('yukibana/cloud/update/doneToMerge', "Updated. You can now merge your teacher's changes into {0} you also changed.", files(toMerge));
        if (toMerge > 0) {
            this.show();
        }
        // Not awaited: the notification stays until dismissed, and the update is over before then
        this.messages
            .info(message, undo)
            .then(choice => (choice === undo ? this.undo() : undefined))
            .catch((e: unknown) => this.reportFailure(e));
    }

    /**
     * Puts back what the last update wrote, asking first if the student changed any of it since.
     *
     * - Requires: `state.last` is set.
     */
    async undo(): Promise<void> {
        const { root, last } = this.requireLast();
        await this.saveOpenEditors(root, [...last.decided, ...last.pending]);
        let result = await this.service.undo(root.toString(), false);
        if (result.kind === 'confirm') {
            const ok = await new ConfirmDialog({
                title: nls.localize('yukibana/cloud/update/undoConfirmTitle', 'Undo the update?'),
                msg: nls.localize(
                    'yukibana/cloud/update/undoConfirm',
                    'You changed these files after the update: {0}. Undoing puts them back as they were before the update, and your later changes to them are lost.',
                    result.paths.join(', '),
                ),
                ok: nls.localize('yukibana/cloud/update/undo', 'Undo update'),
            }).open();
            if (!ok) {
                return;
            }
            result = await this.service.undo(root.toString(), true);
        }
        if (result.kind === 'failed') {
            this.messages.error(localizeMarkdown('yukibana/cloud/update/undoFailed', 'Could not undo the update: {0}', result.reason));
            return;
        }
        if (result.kind === 'undone') {
            this.set({ root, state: result.state });
            this.messages.info(nls.localize('yukibana/cloud/update/undone', 'The update was undone. Your files are as they were before it.'));
        }
    }

    /**
     * Settles the pending `row` of the last update with `resolution`.
     *
     * - Requires: `state.last` is set.
     */
    async resolve(row: PendingRow, resolution: Resolution): Promise<void> {
        const { root } = this.requireLast();
        if (resolution === 'teacher' || resolution === 'delete') {
            await this.saveOpenEditors(root, [row]);
        }
        this.set({ root, state: await this.service.resolve(root.toString(), row.path, resolution) });
    }

    /** Returns the pending row of the last update whose file is `uri`, or `undefined` when there is none. */
    pendingAt(uri: URI): PendingRow | undefined {
        const path = this.checked?.root.relative(uri)?.toString();
        return this.state.last?.pending.find(r => r.path === path);
    }

    /** Tells the student that an action failed, since the view's buttons have nowhere else to say it. */
    reportFailure(e: unknown): void {
        this.logger.error('An assignment update action failed', e);
        this.messages.error(localizeMarkdown('yukibana/cloud/update/actionFailed', 'That did not work: {0}', messageOf(e)));
    }

    /**
     * Opens what the student changed in `row`'s file since the release they started from: what the update replaces.
     *
     * - Requires: `state.available` is set.
     */
    async reviewOwnChanges(row: DecidedRow): Promise<void> {
        const { root, available } = this.requireAvailable();
        await this.compare(root, row, { kind: 'release', release: available.from }, 'file', nls.localize('yukibana/cloud/update/yourChanges', 'Your changes'));
    }

    /**
     * Opens the student's file next to the teacher's new version, or the one of them that exists.
     *
     * - Requires: `state.available` is set.
     */
    async compareAvailable(row: UpdateRow): Promise<void> {
        const { root, available } = this.requireAvailable();
        const theirs: UpdateSide = { kind: 'release', release: available.to };
        if (!row.present || row.kind === 'delete') {
            await this.openVersion(root, row.present ? 'file' : theirs, row.path);
        } else {
            await this.compare(root, row, 'file', theirs);
        }
    }

    /**
     * Opens the file of the last update's pending `row` next to the teacher's version.
     *
     * - Requires: `state.last` is set.
     */
    async compareTeachers(row: PendingRow): Promise<void> {
        const { root, last } = this.requireLast();
        await this.compare(root, row, 'file', { kind: 'release', release: last.to });
    }

    /**
     * Opens the file of the last update's decided `row` as it was before the update next to the file now, or the old
     * version alone when the update deleted it.
     *
     * - Requires: `state.last` is set.
     */
    async compareUpdated(row: DecidedRow): Promise<void> {
        const { root } = this.requireLast();
        if (row.kind === 'delete') {
            await this.openVersion(root, { kind: 'before' }, row.path);
        } else {
            await this.compare(root, row, { kind: 'before' }, 'file', nls.localize('yukibana/cloud/update/beforeAfter', 'before the update ↔ now'));
        }
    }

    /**
     * Opens the student's file as it was before the last update, read-only, to copy from.
     *
     * - Requires: `state.last` is set.
     */
    async openBefore(row: DecidedRow): Promise<void> {
        const { root } = this.requireLast();
        await this.openVersion(root, { kind: 'before' }, row.path);
    }

    /**
     * Opens the merge editor on the last update's pending `row`, a file both changed.
     *
     * The result is the student's real file, as it is: their own lines stay until they take a change of the teacher's,
     * so closing, autosave or finishing with places left never removes what they wrote. "Your version" is a read-only
     * snapshot from the backup, not the live file, which would share the result's text model and change under them.
     * - Requires: `state.last` is set.
     */
    async merge(row: PendingRow): Promise<void> {
        const { root, last } = this.requireLast();
        const uri = MergeEditorUri.encode({
            baseUri: this.uriOf(root, { kind: 'release', release: last.from }, row.path),
            side1Uri: this.uriOf(root, { kind: 'before' }, row.path),
            side2Uri: this.uriOf(root, { kind: 'release', release: last.to }, row.path),
            resultUri: this.uriOf(root, 'file', row.path),
        });
        const options: MergeEditorOpenerOptions = {
            widgetState: {
                // The original starter is what neither side is; showing it only adds a third version to compare
                layoutMode: { kind: 'columns', showBase: false, showBaseAtTop: false },
                side1State: { title: YOUR_VERSION(), description: nls.localize('yukibana/cloud/update/yourVersionDetail', 'before the update') },
                side2State: { title: TEACHERS_VERSION(), description: nls.localize('yukibana/cloud/update/teachersVersionDetail', 'the new version') },
            },
        };
        await open(this.openers, uri, options);
    }

    /** Returns the workspace folder an update is about: the first root, as everywhere else in Yukibana. */
    protected root(): URI | undefined {
        return this.workspaces.tryGetRoots()[0]?.resource;
    }

    /** Schedules the next check after the one that just ended. */
    protected schedule(): void {
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.refresh(), nextCheckIn(Date.now(), this.state.deadline));
    }

    /** Checks the workspace folder, announces what is new, and returns its state; a failure keeps the state it had. */
    protected async check(): Promise<UpdateState> {
        const root = this.root();
        if (root === undefined) {
            return this.set(undefined);
        }
        this.lastCheck = Date.now();
        try {
            const checked = { root, state: await this.service.check(root.toString()) };
            this.set(checked);
            this.announce(checked).catch((e: unknown) => this.reportFailure(e));
            return checked.state;
        } catch (e) {
            this.logger.warn('Could not check for an assignment update', e);
            return this.state;
        }
    }

    /** Makes `checked` the current state, tells the listeners, and returns its state. */
    protected set(checked: Checked | undefined): UpdateState {
        this.checked = checked;
        this.onDidChangeEmitter.fire(this.state);
        return this.state;
    }

    /** Tells the student about a rollback in `checked`, and about its available update if this folder has not heard of it. */
    protected async announce({ root, state }: Checked): Promise<void> {
        if (state.rolledBack) {
            this.messages.warn(
                nls.localize(
                    'yukibana/cloud/update/rolledBack',
                    'An assignment update was interrupted before it finished, so your files have been put back as they were before it.',
                ),
            );
        }
        const available = state.available;
        if (available === undefined) {
            return;
        }
        const key = `yukibana.update.announced:${root.toString()}`;
        if ((await this.storage.getData<string>(key)) === available.to) {
            return;
        }
        await this.storage.setData(key, available.to);
        const update = updateButton(available);
        const show = nls.localize('yukibana/cloud/update/showChanges', 'Show changes');
        const later = nls.localize('yukibana/cloud/update/later', 'Later');
        const choice = await this.messages.info(notification(available), update, show, later);
        if (choice === update) {
            await this.update();
        } else if (choice === show) {
            this.show();
        }
    }

    /** Returns the folder and its available update. - Requires: `state.available` is set. */
    protected requireAvailable(): { root: URI; available: AvailableUpdate } {
        const available = this.checked?.state.available;
        if (this.checked === undefined || available === undefined) {
            throw new Error('No assignment update is available.');
        }
        return { root: this.checked.root, available };
    }

    /** Returns the folder and its last update. - Requires: `state.last` is set. */
    protected requireLast(): { root: URI; last: LastUpdate } {
        const last = this.checked?.state.last;
        if (this.checked === undefined || last === undefined) {
            throw new Error('There is no assignment update to undo or settle.');
        }
        return { root: this.checked.root, last };
    }

    /** Returns the URI of `path` in `version`, for the folder `root`. */
    protected uriOf(root: URI, version: Version, path: string): URI {
        return version === 'file' ? root.resolve(path) : UpdateUri.encode({ workspace: root.toString(), side: version, path });
    }

    /** Opens `path` in `version`, for the folder `root`. */
    protected async openVersion(root: URI, version: Version, path: string): Promise<void> {
        await open(this.openers, this.uriOf(root, version, path));
    }

    /**
     * Opens a diff of `row`'s file from `left` to `right`, titled `label` or "Your version ↔ Teacher's version".
     *
     * A file that is not text opens alone, as `right` has it.
     */
    protected async compare(root: URI, row: UpdateRow, left: Version, right: Version, label?: string): Promise<void> {
        const rightUri = this.uriOf(root, right, row.path);
        if (!row.text) {
            await open(this.openers, rightUri);
            return;
        }
        const title = label ?? `${YOUR_VERSION()} ↔ ${TEACHERS_VERSION()}`;
        await open(this.openers, DiffUris.encode(this.uriOf(root, left, row.path), rightUri, `${row.path} (${title})`));
    }

    /** Saves the editors with unsaved changes to the files of `rows` in `root`, so that the backend works on what the student sees. */
    protected async saveOpenEditors(root: URI, rows: readonly UpdateRow[]): Promise<void> {
        const paths = new Set(rows.map(r => root.resolve(r.path).toString()));
        await Promise.all(this.editors.all.filter(e => e.saveable.dirty && paths.has(e.editor.uri.toString())).map(e => e.saveable.save()));
    }
}
