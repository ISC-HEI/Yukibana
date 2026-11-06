/**
 * SPDX-License-Identifier: MIT
 */
import { nls, URI } from '@theia/core';
import { codicon, LabelProvider } from '@theia/core/lib/browser';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { AvailableUpdate, DecidedRow, isDecided, LastUpdate, PendingRow, UpdateRow } from '../../common/update-protocol';
import { AssignmentUpdates } from './assignment-updates';
import { badge, describe, replacesEdits, updateButton } from './update-texts';

/** An action on a row: an icon that shows on hover or focus, named by its tooltip. */
interface RowAction {
    /** The codicon's name. */
    readonly icon: string;
    /** What the action does, for the tooltip and screen readers. */
    readonly label: string;
    /** Does it. */
    readonly run: () => Promise<void>;
}

/**
 * The Assignment Update view, in the side panel so it stays in sight beside the diff and merge editors it opens.
 *
 * It looks like source control: one line per file, its name, its folder dimmed, and a coloured letter for what
 * happens to it; the words are in the hover. Clicking a file opens its comparison (or its merge); the other actions
 * are icons that show on hover. One button is the main one: Update, before an update. Check and Undo are in the
 * view's toolbar. Everything it shows comes from the backend's state, which is on disk, so a reload loses nothing.
 */
@injectable()
export class UpdateWidget extends ReactWidget {
    /** The view's id. */
    static readonly ID = 'yukibana.assignment-update';
    /** The view's title. */
    static readonly LABEL = nls.localize('yukibana/cloud/update/viewTitle', 'Assignment Update');

    @inject(AssignmentUpdates) protected readonly updates!: AssignmentUpdates;
    @inject(LabelProvider) protected readonly labels!: LabelProvider;

    /** Whether an action is running, which disables every button. */
    protected busy = false;

    /** Sets up the view, which redraws whenever the state changes. */
    @postConstruct()
    protected init(): void {
        this.id = UpdateWidget.ID;
        this.title.label = UpdateWidget.LABEL;
        this.title.caption = UpdateWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = codicon('cloud-download');
        this.addClass('yukibana-update');
        this.toDispose.push(this.updates.onDidChange(() => this.update()));
        this.update();
    }

    /** Runs `action` with every button disabled, so a second click cannot start a second update. */
    protected run(action: () => Promise<void>): void {
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.update();
        action()
            .catch((e: unknown) => this.updates.reportFailure(e))
            .finally(() => {
                this.busy = false;
                this.update();
            });
    }

    /** Returns the view: the available update, the last one, or a line saying there is none. */
    protected render(): React.ReactNode {
        const state = this.updates.state;
        const last = state.last && (state.last.pending.length > 0 || state.last.decided.length > 0) ? state.last : undefined;
        return (
            <div className='yukibana-update-body' aria-busy={this.busy}>
                {state.available && this.renderAvailable(state.available)}
                {last && this.renderLast(last)}
                {!state.available && !last && (
                    <div className='yukibana-update-empty'>
                        <span className={codicon(state.problem ? 'warning' : 'pass')} aria-hidden='true' />
                        <span title={state.problem}>
                            {state.problem
                                ? nls.localize('yukibana/cloud/update/cannotCheckShort', 'Could not check for an update')
                                : nls.localize('yukibana/cloud/update/upToDateShort', 'You have the newest version')}
                        </span>
                    </div>
                )}
            </div>
        );
    }

    /** Returns the section for `update`, not applied yet. */
    protected renderAvailable(update: AvailableUpdate): React.ReactNode {
        const replaced = replacesEdits(update.decided);
        return (
            <section aria-label={nls.localize('yukibana/cloud/update/availableTitle', 'Update available')}>
                <div className='yukibana-update-head'>
                    <span className={codicon('cloud-download')} aria-hidden='true' />
                    <span className='yukibana-update-head-text'>{nls.localize('yukibana/cloud/update/availableShort', 'New version of {0}', update.projectTitle)}</span>
                </div>
                <button className='theia-button main yukibana-update-main' disabled={this.busy} onClick={() => this.run(() => this.updates.update())}>
                    {updateButton(update)}
                </button>
                {replaced.length > 0 && (
                    <div
                        className='yukibana-update-notice'
                        role='note'
                        title={nls.localize(
                            'yukibana/cloud/update/replacedHover',
                            "Read-only files are replaced by your teacher's version, the one that is graded. You can review your changes first, and open your old version after the update.",
                        )}
                    >
                        <span className={codicon('lock')} aria-hidden='true' />
                        {replaced.length === 1
                            ? nls.localize('yukibana/cloud/update/replacedOne', 'Your changes to 1 read-only file will be replaced')
                            : nls.localize('yukibana/cloud/update/replacedMany', 'Your changes to {0} read-only files will be replaced', replaced.length)}
                    </div>
                )}
                {this.renderGroup(nls.localize('yukibana/cloud/update/groupChanges', 'Changes'), update.decided, row => this.availableActions(row))}
                {this.renderGroup(nls.localize('yukibana/cloud/update/groupMergeAfter', 'To merge after updating'), update.pending, row => this.availableActions(row))}
            </section>
        );
    }

    /** Returns the actions on `row` of an update not applied yet. */
    protected availableActions(row: UpdateRow): RowAction[] {
        const actions: RowAction[] = [];
        if (isDecided(row) && row.editedByStudent) {
            actions.push({ icon: 'eye', label: nls.localize('yukibana/cloud/update/replaceReview', 'Review my changes'), run: () => this.updates.reviewOwnChanges(row) });
        }
        if (row.kind !== 'delete') {
            actions.push({
                icon: 'diff',
                label: nls.localize('yukibana/cloud/update/compareTeachers', "Compare with teacher's version"),
                run: () => this.updates.compareAvailable(row),
            });
        }
        return actions;
    }

    /** Returns the section for the last update, `last`. */
    protected renderLast(last: LastUpdate): React.ReactNode {
        return (
            <section aria-label={nls.localize('yukibana/cloud/update/lastTitle', 'Last update')}>
                <div className='yukibana-update-head' title={nls.localize('yukibana/cloud/update/lastAt', 'Updated {0}.', new Date(last.at).toLocaleString())}>
                    <span className={codicon('history')} aria-hidden='true' />
                    <span className='yukibana-update-head-text'>
                        {nls.localize('yukibana/cloud/update/lastShort', 'Updated {0}', new Date(last.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}
                    </span>
                </div>
                {this.renderGroup(nls.localize('yukibana/cloud/update/groupToMerge', 'To merge'), last.pending, row => this.pendingActions(row), 'next')}
                {this.renderGroup(nls.localize('yukibana/cloud/update/groupUpdated', 'Updated'), last.decided, row => this.updatedActions(row), 'quiet')}
            </section>
        );
    }

    /** Returns the actions on the last update's pending `row`, the one settling it the way most students want first. */
    protected pendingActions(row: PendingRow): RowAction[] {
        const keep: RowAction = { icon: 'check', label: nls.localize('yukibana/cloud/update/keepMine', 'Keep mine'), run: () => this.updates.resolve(row, 'keep') };
        if (row.kind === 'merge') {
            return [{ icon: 'git-merge', label: nls.localize('yukibana/cloud/update/merge', 'Merge…'), run: () => this.updates.merge(row) }, keep];
        }
        if (row.reason === 'deletedByTeacher') {
            return [{ icon: 'trash', label: nls.localize('yukibana/cloud/update/delete', 'Delete it'), run: () => this.updates.resolve(row, 'delete') }, keep];
        }
        const actions: RowAction[] = [];
        if (row.text && row.reason !== 'deletedByStudent') {
            actions.push({
                icon: 'diff',
                label: nls.localize('yukibana/cloud/update/compareTeachers', "Compare with teacher's version"),
                run: () => this.updates.compareTeachers(row),
            });
        }
        actions.push({ icon: 'cloud-download', label: nls.localize('yukibana/cloud/update/useTeachers', "Use teacher's"), run: () => this.updates.resolve(row, 'teacher') });
        actions.push(row.reason === 'deletedByStudent' ? { ...keep, label: nls.localize('yukibana/cloud/update/keepDeleted', 'Keep it deleted') } : keep);
        return actions;
    }

    /** Returns the actions on the last update's decided `row`. */
    protected updatedActions(row: DecidedRow): RowAction[] {
        const actions: RowAction[] = [];
        if (row.text && row.present) {
            actions.push({
                icon: 'diff',
                label: nls.localize('yukibana/cloud/update/compareBefore', 'Compare with before the update'),
                run: () => this.updates.compareUpdated(row),
            });
        }
        if (row.present && row.editedByStudent) {
            actions.push({ icon: 'history', label: nls.localize('yukibana/cloud/update/openOld', 'Open your old version'), run: () => this.updates.openBefore(row) });
        }
        return actions;
    }

    /** Returns a titled list of `rows` with their `actionsOf`, drawn with `emphasis`, or nothing when `rows` is empty. */
    protected renderGroup<R extends UpdateRow>(title: string, rows: readonly R[], actionsOf: (row: R) => RowAction[], emphasis?: 'next' | 'quiet'): React.ReactNode {
        if (rows.length === 0) {
            return undefined;
        }
        return (
            <div className={`yukibana-update-group${emphasis ? ` ${emphasis}` : ''}`}>
                <div className='yukibana-update-group-title'>
                    {title}
                    <span className='yukibana-update-count'>{rows.length}</span>
                </div>
                <ul>{rows.map(row => this.renderRow(row, actionsOf(row)))}</ul>
            </div>
        );
    }

    /** Returns the line of `row`: clicking it runs the first of `actions`; each is also an icon button, named for screen readers. */
    protected renderRow(row: UpdateRow, actions: RowAction[]): React.ReactNode {
        const b = badge(row);
        const slash = row.path.lastIndexOf('/');
        const name = row.path.slice(slash + 1);
        const folder = slash < 0 ? '' : row.path.slice(0, slash);
        const icon = this.labels.getIcon(new URI(`file:///${row.path}`));
        const primary = actions[0];
        const hover = `${row.path}\n${b.label}: ${describe(row)}${primary ? `\n${primary.label}` : ''}`;
        return (
            <li key={row.path} className={`yukibana-update-row ${b.kind}${row.kind === 'delete' ? ' gone' : ''}`} title={hover}>
                <span
                    className='yukibana-update-file'
                    role={primary ? 'button' : undefined}
                    tabIndex={primary ? 0 : undefined}
                    aria-label={primary ? `${primary.label}: ${row.path}` : row.path}
                    onClick={primary && (() => this.run(primary.run))}
                    onKeyDown={primary && (e => (e.key === 'Enter' || e.key === ' ') && this.run(primary.run))}
                >
                    <span className={`${icon} file-icon`} aria-hidden='true' />
                    <span className='yukibana-update-name'>{name}</span>
                    {folder !== '' && <span className='yukibana-update-folder'>{folder}</span>}
                    {isDecided(row) && row.protected && (
                        <span className={`${codicon('lock')} yukibana-update-lock`} title={nls.localize('yukibana/cloud/update/readOnly', 'Read-only')} />
                    )}
                </span>
                <span className='yukibana-update-actions'>
                    {actions.map(a => (
                        <button
                            key={a.label}
                            className={`${codicon(a.icon)} yukibana-update-action`}
                            title={a.label}
                            aria-label={`${a.label}: ${row.path}`}
                            disabled={this.busy}
                            onClick={() => this.run(a.run)}
                        />
                    ))}
                </span>
                <span className='yukibana-update-badge' aria-label={b.label} title={b.label}>
                    {b.letter}
                </span>
            </li>
        );
    }
}
