/**
 * SPDX-License-Identifier: MIT
 */
import { CommandService, MaybePromise, nls } from '@theia/core';
import { Dialog, DialogError, DialogMode } from '@theia/core/lib/browser';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import React from 'react';
import { SubmissionPreview } from '../common/submission-protocol';
import { SubmissionTarget, SubmissionTargetAvailability } from '../common/submission-target';

export const SUBMISSION_SUMMARY_CONTENT_CLASS = 'yukibana-submissionSummaryDialog';

const formatSize = (n: number): string =>
    n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

export class SubmissionSummaryDialog extends ReactDialog<boolean> {
    private availability: SubmissionTargetAvailability | undefined;

    constructor(
        protected readonly preview: SubmissionPreview,
        protected readonly target: SubmissionTarget,
        protected readonly commandService: CommandService,
    ) {
        super({
            title: nls.localize('yukibana/submission/summaryTitle', 'Submission summary'),
        });
        this.appendCloseButton(Dialog.CANCEL);
        this.appendAcceptButton(nls.localize('yukibana/submission/submit', 'Submit'));
        this.refreshAvailability();
    }

    protected async refreshAvailability(): Promise<void> {
        this.availability = undefined;
        this.update();
        await this.validate();
        try {
            this.availability = await this.target.getAvailability();
        } catch (e) {
            this.availability = {
                available: false,
                reason: nls.localize('yukibana/submission/checkFailed', 'Could not check target availability'),
                actions: [
                    {
                        label: nls.localize('yukibana/submission/checkRetry', 'Retry'),
                        command: () => this.refreshAvailability(),
                    }
                ],
            };
        }
        this.update();
        await this.validate();
    }

    protected override isValid(value: boolean, mode: DialogMode): MaybePromise<DialogError> {
        if (this.availability?.available !== true) {
            return false;
        }
        return super.isValid(value, mode);
    }

    protected render(): React.ReactNode {
        return <div className={SUBMISSION_SUMMARY_CONTENT_CLASS}>
            {this.renderHeader()}
            {this.renderFiles()}
            {this.renderAvailability()}
        </div>;
    }

    protected renderHeader(): React.ReactNode {
        const title = nls.localize('yukibana/submission/summaryHeader', 'Are you ready to submit?');
        const fileCountLabel = nls.localize('yukibana/submission/summaryFileCount', 'Number of files');
        const totalSizeLabel = nls.localize('yukibana/submission/summaryTotalSize', 'Total size');
        return <>
            <h3>{title}</h3>
            <p>
                {`${fileCountLabel}: ${this.preview.entries.length}`}<br />
                {`${totalSizeLabel}: ${formatSize(this.preview.totalSize)}`}
            </p>
        </>;
    }
    protected renderFiles(): React.ReactNode {
        const filesLabel = nls.localize('yukibana/submission/summaryFiles', 'Submitted files');
        const { entries } = this.preview;
        return <>
            <h3>{filesLabel}</h3>
            <div>
                <ul className='yukibana-submission-list'>
                    {entries.map(e => (
                        <li key={e.path}>
                            <span>{e.path}</span>
                            <span className='size'>{formatSize(e.size)}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </>;
    }

    protected renderAvailability(): React.ReactNode {
        const a = this.availability;
        if (a === undefined) {
            return <div className='yukibana-availability checking'>
                {nls.localize('yukibana/submission/checking', 'Checking target availability...')}
            </div>;
        }
        if (a.available) {
            return undefined;
        }
        const title = nls.localize('yukibana/submission/unavailabilityHeader', 'There might be an issue');
        return <div className='yukibana-availability unavailable' role='alert'>
            <h3>{title}</h3>
            <div className="yukibana-availability-info">
                <p className="yukibana-availability-reason">{a.reason}</p>
                {a.actions?.length ? (
                    <div className="yukibana-availability-actions">
                        {a.actions.map(action => (
                            <button
                                key={action.label}
                                className='theia-button secondary'
                                onClick={async () => {
                                    await this.runCommand(action.command);
                                    await this.refreshAvailability();
                                }}
                            >
                                {action.label}
                            </button>
                        ))}
                    </div>
                ) : undefined}
            </div>
        </div>;
    }

    private runCommand(command: string | (() => Promise<void>)): Promise<void> {
        console.log(`running command ${command}`);
        if (typeof command === 'string') {
            return this.commandService.executeCommand(command);
        } else {
            return command();
        }
    }

    get value(): boolean { return true; }
}
