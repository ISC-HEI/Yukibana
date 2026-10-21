/**
 * SPDX-License-Identifier: MIT
 */
import { nls, URI } from '@theia/core';
import { inject } from '@theia/core/shared/inversify';
import { SubmissionResult, SubmissionTarget, SubmissionTargetAvailability } from 'yukibana-submission-ext/lib/common/submission-target';
import { CloudAuth, CloudService } from '../common/cloud-protocol';
import { LoginCommand } from './command-contribution';

export class CloudSubmissionTarget implements SubmissionTarget {
    readonly id = 'cloud';
    readonly label = 'Cloud';

    @inject(CloudService) protected readonly service!: CloudService;
    @inject(CloudAuth) protected readonly auth!: CloudAuth;

    async getAvailability(): Promise<SubmissionTargetAvailability> {
        if (await this.auth.isLoggedIn()) {
            return { available: true };
        }
        return {
            available: false,
            reason: nls.localize('yukibana/cloud/submission/notLoggedIn', 'You are not logged in'),
            actions: [
                {
                    label: nls.localize('yukibana/cloud/submission/login', 'Log in'),
                    command: LoginCommand.id,
                },
            ]
        };
    }

    submit(projectId: string, archive: URI): Promise<SubmissionResult> {
        return this.service.submit(projectId, archive.toString());
    }
}
