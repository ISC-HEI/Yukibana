/**
 * SPDX-License-Identifier: MIT
 */
import { nls, URI } from '@theia/core';
import { inject } from '@theia/core/shared/inversify';
import { SubmissionResult, SubmissionTarget, SubmissionTargetAvailability } from 'yukibana-submission-ext/lib/common/submission-target';
import { CanSubmitStatus, CloudAuth, CloudService } from '../common/cloud-protocol';
import { LoginCommand } from './command-contribution';

export class CloudSubmissionTarget implements SubmissionTarget {
    readonly id = 'cloud';
    readonly label = 'Cloud';

    @inject(CloudService) protected readonly service!: CloudService;
    @inject(CloudAuth) protected readonly auth!: CloudAuth;

    async getAvailability(projectId: string): Promise<SubmissionTargetAvailability> {
        if (!await this.auth.isLoggedIn()) {
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
        const canSubmit: CanSubmitStatus = await this.service.canSubmitProject(projectId);

        switch (canSubmit) {
            case CanSubmitStatus.OPEN:
                return { available: true };

            case CanSubmitStatus.LATE:
                return {
                    available: true,
                    message: nls.localize('yukibana/cloud/submission/late', 'You are late but you can still submit. Hurry up'),
                };

            case CanSubmitStatus.NOT_ALLOWED:
                return {
                    available: false,
                    reason: nls.localize('yukibana/cloud/submission/notAllowed', 'You are not allowed to submit for this project'),
                    actions: [],
                };

            case CanSubmitStatus.NOT_OPEN:
                return {
                    available: false,
                    reason: nls.localize('yukibana/cloud/submission/tooEarly', 'It is too early to submit. Try again later'),
                    actions: [],
                };

            case CanSubmitStatus.CLOSED:
                return {
                    available: false,
                    reason: nls.localize('yukibana/cloud/submission/tooLate', 'The assignment has been closed. You cannot submit anymore'),
                    actions: [],
                };

            default:
                return {
                    available: false,
                    reason: nls.localize('yukibana/cloud/submission/cannotSubmitUnknown', 'You cannot submit right now. Try again later'),
                    actions: [],
                };
        }
    }

    submit(projectId: string, archive: URI): Promise<SubmissionResult> {
        return this.service.submit(projectId, archive.toString());
    }
}
