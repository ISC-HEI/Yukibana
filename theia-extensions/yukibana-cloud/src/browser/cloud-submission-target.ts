/**
 * SPDX-License-Identifier: MIT
 */
import { URI } from '@theia/core';
import { inject } from '@theia/core/shared/inversify';
import { SubmissionResult, SubmissionTarget } from 'yukibana-submission-ext/lib/common/submission-target';
import { CloudAuth, CloudService } from '../common/cloud-protocol';

export class CloudSubmissionTarget implements SubmissionTarget {
    readonly id = 'cloud';
    readonly label = 'Cloud';

    @inject(CloudService) protected readonly service!: CloudService;
    @inject(CloudAuth) protected readonly auth!: CloudAuth;

    isAvailable(): Promise<boolean> {
        return this.auth.isLoggedIn();
    }

    async submit(projectId: string, archive: URI): Promise<SubmissionResult> {
        const result = await this.service.submit(projectId, archive.toString());
        return {
            ok: result.ok
        };
    }
}
