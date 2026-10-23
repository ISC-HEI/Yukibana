/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger } from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { RegistryError, unpackStarter } from '@yukibana/cli';
import * as fs from 'fs';
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
        try {
            const leftOut = await unpackStarter(await this.client.downloadStarter(projectId), FileUri.fsPath(destinationURI));
            for (const entry of leftOut) {
                this.logger.warn(`Not unpacked from the starter of ${projectId}: ${entry}`);
            }
            return { ok: true, leftOut };
        } catch (e) {
            this.logger.error(e instanceof Error ? e : String(e));
            return { ok: false, reason: e instanceof Error ? e.message : String(e) };
        }
    }

    canSubmitProject(projectId: string): Promise<SubmitAvailability> {
        return this.client.isProjectAcceptingSubmissions(projectId);
    }
}
