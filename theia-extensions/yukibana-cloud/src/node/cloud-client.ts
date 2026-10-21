/**
 * SPDX-License-Identifier: MIT
 */
import { inject, injectable } from '@theia/core/shared/inversify';
import { tokenProvider, YukibanaClient } from '@yukibana/cli';
import { CloudSessionManager, DEFAULT_REGISTRY } from './cloud-session-manager';
import { CanSubmitStatus } from '../common/cloud-protocol';

@injectable()
export class CloudClient extends YukibanaClient {
    constructor(
        @inject(CloudSessionManager) protected readonly cloudService: CloudSessionManager,
    ) {
        super({
            url: DEFAULT_REGISTRY,
            accessToken: tokenProvider(cloudService)
        });
    }

    async isProjectAcceptingSubmissions(projectId: string): Promise<CanSubmitStatus> {
        try {
            const project = await this.project(projectId);
            if (!project.canSubmit) {
                return CanSubmitStatus.NOT_ALLOWED;
            }
            const now = Date.now();
            const start = this.parseDate(project.availableAfter);
            if (start === undefined || now < start) {
                return CanSubmitStatus.NOT_OPEN;
            }
            const end = this.parseDate(project.closesAt);
            if (end !== undefined && now > end) {
                return CanSubmitStatus.CLOSED;
            }
            const deadline = this.parseDate(project.deadline);
            if (deadline !== undefined && now > deadline) {
                return CanSubmitStatus.LATE;
            }
            return CanSubmitStatus.OPEN;
        } catch {
            return CanSubmitStatus.UNKNOWN;
        }
    }

    private parseDate(dateStr: string | null): number | undefined {
        if (!dateStr) {
            return undefined;
        }
        try {
            return Date.parse(dateStr);
        } catch {
            return undefined;
        }
    }
}
