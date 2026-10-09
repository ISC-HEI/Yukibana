/**
 * SPDX-License-Identifier: MIT
 */
import { nls } from '@theia/core';
import { Dialog } from '@theia/core/lib/browser';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import React from 'react';
import { SubmissionPreview } from '../common/submission-protocol';

export const SUBMISSION_SUMMARY_CONTENT_CLASS = 'yukibana-submissionSummaryDialog';

const formatSize = (n: number): string =>
    n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

export class SubmissionSummaryDialog extends ReactDialog<boolean> {
    constructor(
        protected readonly preview: SubmissionPreview,
    ) {
        super({
            title: nls.localize('yukibana/submission/summaryTitle', 'Submission summary'),
        });
        this.appendCloseButton(Dialog.CANCEL);
        this.appendAcceptButton(nls.localize('yukibana/submission/submit', 'Submit'));
    }

    protected render(): React.ReactNode {
        return <div className={SUBMISSION_SUMMARY_CONTENT_CLASS}>
            {this.renderHeader()}
            {this.renderFiles()}
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

    get value(): boolean { return true; }
}
