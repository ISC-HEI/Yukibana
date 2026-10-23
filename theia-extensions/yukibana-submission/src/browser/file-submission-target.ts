/**
 * SPDX-License-Identifier: MIT
 */
import { nls, URI } from '@theia/core';
import { inject } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { SubmissionService } from '../common/submission-protocol';
import { SubmissionResult, SubmissionTarget, SubmissionTargetAvailability } from '../common/submission-target';

export class FileSubmissionTarget implements SubmissionTarget {
    readonly id = 'file';
    readonly label = 'File';

    @inject(WorkspaceService) protected readonly workspaceService!: WorkspaceService;
    @inject(SubmissionService) protected readonly submissionService!: SubmissionService;

    async getAvailability(): Promise<SubmissionTargetAvailability> {
        return {
            available: true
        };
    }

    async submit(projectId: string, archive: URI): Promise<SubmissionResult> {
        const root = this.workspaceService.tryGetRoots()[0]?.resource;
        if (root === undefined) {
            return {
                ok: false,
                reason: nls.localize('yukibana/submission/fileTarget/noWorkspaceRoot', 'No workspace root'),
            };
        }
        const out = root.resolve('submission.tar.gz').toString();
        if (await this.submissionService.copyFile(archive.toString(), out)) {
            return {
                ok: true
            };
        } else {
            return {
                ok: false,
                reason: nls.localize('yukibana/submission/fileTarget/copyFail', 'Failed to copy file')
            };
        }
    }
}
