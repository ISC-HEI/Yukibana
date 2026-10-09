/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger } from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { Project } from '@yukibana/cli';
import * as fs from 'fs';
import * as tar from 'tar';
import { CloudService, SubmissionResult } from '../common/cloud-protocol';
import { CloudClient } from './cloud-client';

@injectable()
export class CloudServiceImpl implements CloudService {
    @inject(CloudClient) protected readonly client!: CloudClient;
    @inject(ILogger) @named('yukibana:CloudService') protected readonly logger!: ILogger;

    async submit(projectId: string, archiveURI: string): Promise<SubmissionResult> {
        const archivePath = FileUri.fsPath(archiveURI);
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

    async getProjectInfo(projectId: string): Promise<Project | undefined> {
        try {
            return await this.client.project(projectId);
        } catch {
            return undefined;
        }
    }

    async downloadProject(projectId: string, destinationURI: string): Promise<boolean> {
        const starter = await this.client.downloadStarter(projectId);
        const destinationPath = FileUri.fsPath(destinationURI);

        const source = Buffer.from(starter.buffer, starter.byteOffset, starter.byteLength);

        try {
            await new Promise((resolve, reject) => {
                const extract = tar.x({ cwd: destinationPath });
                extract.on('error', reject);
                extract.on('close', resolve);
                extract.end(source);
            });
            return true;
        } catch (e) {
            this.logger.error(e instanceof Error ? e : String(e));
            return false;
        }
    }
}
