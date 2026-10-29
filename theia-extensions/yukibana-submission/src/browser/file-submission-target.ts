/**
 * SPDX-License-Identifier: MIT
 */
import { nls } from '@theia/core';
import { inject } from '@theia/core/shared/inversify';
import { FileDialogService } from '@theia/filesystem/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { SubmissionService } from '../common/submission-protocol';
import { SubmissionResult, SubmissionTarget, SubmissionTargetAvailability } from '../common/submission-target';

/**
 * Saves a submission as a `.tar.gz` where the student chooses.
 *
 * It used to write `submission.tar.gz` into the workspace root, where nothing left it out of the next submission, so
 * each submission carried the one before. The dialog now starts beside the workspace instead.
 */
export class FileSubmissionTarget implements SubmissionTarget {
    readonly id = 'file';
    readonly label = 'File';

    @inject(WorkspaceService) protected readonly workspaceService!: WorkspaceService;
    @inject(SubmissionService) protected readonly submissionService!: SubmissionService;
    @inject(FileDialogService) protected readonly fileDialogs!: FileDialogService;
    @inject(FileService) protected readonly files!: FileService;

    async getAvailability(): Promise<SubmissionTargetAvailability> {
        return {
            available: true,
        };
    }

    async submit(_projectId: string, submissionId: string): Promise<SubmissionResult> {
        const root = this.workspaceService.tryGetRoots()[0]?.resource;
        const beside = root === undefined ? undefined : await this.files.resolve(root.parent).catch(() => undefined);
        const destination = await this.fileDialogs.showSaveDialog(
            {
                title: nls.localize('yukibana/submission/fileTarget/saveTitle', 'Save submission'),
                inputValue: 'submission.tar.gz',
            },
            beside,
        );
        if (destination === undefined) {
            return {
                ok: false,
                reason: nls.localize('yukibana/submission/fileTarget/noFileChosen', 'No file was chosen'),
            };
        }
        if (await this.submissionService.save(submissionId, destination.toString())) {
            return {
                ok: true,
            };
        }
        return {
            ok: false,
            reason: nls.localize('yukibana/submission/fileTarget/gone', 'The submission is no longer prepared; submit again'),
        };
    }
}
