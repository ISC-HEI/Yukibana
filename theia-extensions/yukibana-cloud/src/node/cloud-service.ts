/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger } from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { RegistryError } from '@yukibana/cli';
import * as fs from 'fs';
import * as path from 'path';
import * as tar from 'tar';
import { CloudService, DownloadResult, ProjectListing, ProjectLookup, SubmissionResult, SubmitAvailability } from '../common/cloud-protocol';
import { CloudClient, isRefused } from './cloud-client';
import { CloudSessionManager } from './cloud-session-manager';

@injectable()
export class CloudServiceImpl implements CloudService {
    @inject(CloudClient) protected readonly client!: CloudClient;
    @inject(CloudSessionManager) protected readonly sessions!: CloudSessionManager;
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

    async getProjectInfo(projectId: string): Promise<ProjectLookup> {
        try {
            return { kind: 'found', project: await this.client.project(projectId) };
        } catch (e) {
            if (e instanceof RegistryError && e.status === 404) {
                return { kind: 'not-found' };
            }
            if (await this.isLoggedOut(e)) {
                return { kind: 'not-logged-in' };
            }
            throw e;
        }
    }

    async listProjects(): Promise<ProjectListing> {
        try {
            return { kind: 'found', projects: await this.client.projects() };
        } catch (e) {
            if (await this.isLoggedOut(e)) {
                return { kind: 'not-logged-in' };
            }
            // The welcome screen shows the reason rather than an empty list, which would read as nothing due
            this.logger.warn(`Could not list projects: ${e instanceof Error ? e.message : String(e)}`);
            return { kind: 'error', reason: e instanceof Error ? e.message : String(e) };
        }
    }

    /** Returns `true` iff `e`, from a registry call, means nobody is logged in. */
    protected async isLoggedOut(e: unknown): Promise<boolean> {
        return isRefused(e) || !(await this.sessions.isLoggedIn());
    }

    async downloadProject(projectId: string, destinationURI: string): Promise<DownloadResult> {
        const destinationPath = FileUri.fsPath(destinationURI);

        try {
            const starter = await this.client.downloadStarter(projectId);
            const source = Buffer.from(starter.buffer, starter.byteOffset, starter.byteLength);
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
            return {
                ok: false,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    canSubmitProject(projectId: string): Promise<SubmitAvailability> {
        return this.client.isProjectAcceptingSubmissions(projectId);
    }
}
