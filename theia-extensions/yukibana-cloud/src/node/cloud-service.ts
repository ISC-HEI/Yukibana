/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger } from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { Project } from '@yukibana/cli';
import * as fs from 'fs';
import * as path from 'path';
import * as tar from 'tar';
import { CanSubmitStatus, CloudService, DownloadResult, SubmissionResult } from '../common/cloud-protocol';
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

    async downloadProject(projectId: string, destinationURI: string): Promise<DownloadResult> {
        const starter = await this.client.downloadStarter(projectId);
        const destinationPath = FileUri.fsPath(destinationURI);

        const source = Buffer.from(starter.buffer, starter.byteOffset, starter.byteLength);

        try {
            const topLevel = new Map<string, boolean>();

            await new Promise((resolve, reject) => {
                const extract = tar.x({ cwd: destinationPath });
                extract.on('entry', (entry: tar.ReadEntry) => {
                    const segments = entry.path
                        .replace(/^(\.\/)+/, '')
                        .split('/')
                        .filter(s => s.length > 0);

                    if (segments.length === 0) {
                        return;
                    }

                    const name = segments[0];
                    const isDirectory = segments.length > 1 || entry.type === 'Directory';
                    topLevel.set(name, (topLevel.get(name) ?? false) || isDirectory);
                });
                extract.on('error', reject);
                extract.on('close', resolve);
                extract.end(source);
            });
            const [topDirectory] = topLevel.size === 1 ? [...topLevel] : [];
            const projectPath = topDirectory && topDirectory[1]
                ? path.join(destinationPath, topDirectory[0])
                : destinationPath;
            return {
                ok: true,
                uri: FileUri.create(projectPath)
            };
        } catch (e) {
            this.logger.error(e instanceof Error ? e : String(e));
            return { ok: false };
        }
    }

    canSubmitProject(projectId: string): Promise<CanSubmitStatus> {
        return this.client.isProjectAcceptingSubmissions(projectId);
    }
}
