/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import * as fs from 'fs';
import { CloudService, SubmissionResult } from '../common/cloud-protocol';
import { CloudClient } from './cloud-client';

@injectable()
export class CloudServiceImpl implements CloudService {
    @inject(CloudClient) protected readonly client!: CloudClient;
    @inject(ILogger) @named('yukibana:CloudService') protected readonly logger!: ILogger;

    async submit(projectId: string, archivePath: string): Promise<SubmissionResult> {
        this.logger.info(`Submitting archive for project '${projectId}'`);
        const archiveBytes = await fs.promises.readFile(archivePath);
        try {
            const result = await this.client.submitArchive(projectId, archiveBytes);
            return {
                ok: true,
                ...result
            };
        } catch (e) {
            return {
                ok: false,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }
}
