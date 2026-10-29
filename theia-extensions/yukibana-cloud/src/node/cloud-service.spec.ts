/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { FileUri } from '@theia/core/lib/node';
import { Entry, NotLoggedIn, Project, RegistryError, SubmissionBundle, writeTar } from '@yukibana/cli';
import { expect } from 'chai';
import { describe, it, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { DownloadResult } from '../common/cloud-protocol';
import { CloudClient } from './cloud-client';
import { SubmissionServiceImpl } from 'yukibana-submission-ext/lib/node/submission-service';
import { CloudServiceImpl } from './cloud-service';
import { CloudSessionManager } from './cloud-session-manager';

/** Registry calls a test fakes; the others are missing. */
type MockClient = Partial<Pick<CloudClient, 'downloadStarter' | 'project' | 'projects' | 'submit'>>;

/** The one submission the fake submission service holds, under `PREPARED`. */
const prepared = { files: [], problems: [] } as unknown as SubmissionBundle;
const PREPARED = 'submission-1';

function setup(client: MockClient, loggedIn: boolean = true): CloudServiceImpl {
    const service = new CloudServiceImpl();
    Object.assign(service, {
        client: client as CloudClient,
        submissions: { bundle: (id: string) => id === PREPARED ? prepared : undefined } as SubmissionServiceImpl,
        sessions: { isLoggedIn: async () => loggedIn } as CloudSessionManager,
        logger: new MockLogger() as ILogger,
    });
    return service;
}

/** Returns `files` (relative path → content) as a starter: a gzipped tar. */
async function tarball(files: Record<string, string>): Promise<Uint8Array> {
    const entries = Object.entries(files).map(([name, content]): Entry =>
        ({ path: name, type: 'file', mode: 0o644, mtime: 1, data: new TextEncoder().encode(content) }));
    return new Uint8Array(zlib.gzipSync(await writeTar(entries)));
}

const tempDirs: string[] = [];

function tempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yukibana-cloud-spec-'));
    tempDirs.push(dir);
    return dir;
}

/** Downloads `starter` into `destination`, by default a folder that does not exist yet. */
async function download(starter: Uint8Array, destination = path.join(tempDir(), 'warm-up')): Promise<{ result: DownloadResult, destination: string }> {
    const result = await setup({ downloadStarter: async () => starter }).downloadProject('project', FileUri.create(destination).toString());
    return { result, destination };
}

describe('CloudServiceImpl', () => {
    afterAll(() => {
        for (const dir of tempDirs) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    describe('downloadProject', () => {
        it('should unpack a starter straight into the chosen folder, without the folder it is wrapped in', async () => {
            const { result, destination } = await download(await tarball({ 'calc/yukibana.json': '{}', 'calc/src/main.rs': 'fn main() {}' }));

            expect(result).to.deep.equal({ ok: true, leftOut: [] });
            expect(fs.readdirSync(destination).sort()).to.deep.equal(['src', 'yukibana.json']);
            expect(fs.readFileSync(path.join(destination, 'src', 'main.rs'), 'utf8')).to.equal('fn main() {}');
        });

        it('should unpack a starter of loose files as it is', async () => {
            const { destination } = await download(await tarball({ 'Cargo.toml': '[package]', 'src/main.rs': 'fn main() {}' }));

            expect(fs.readdirSync(destination).sort()).to.deep.equal(['Cargo.toml', 'src']);
        });

        it('should never write into a folder that already has files in it', async () => {
            const destination = tempDir();
            fs.writeFileSync(path.join(destination, 'Cargo.toml'), 'my work');

            const { result } = await download(await tarball({ 'Cargo.toml': '[package]' }), destination);

            expect(result.ok).to.equal(false);
            expect(fs.readdirSync(destination)).to.deep.equal(['Cargo.toml']);
            expect(fs.readFileSync(path.join(destination, 'Cargo.toml'), 'utf8')).to.equal('my work');
        });

        it('should report a corrupt archive and leave no folder behind', async () => {
            const { result, destination } = await download(new Uint8Array([1, 2, 3, 4, 5]));

            expect(result).to.deep.equal({ ok: false, reason: 'not a .tar.gz' });
            expect(fs.existsSync(destination)).to.equal(false);
        });

        it('should report the registry error if there is no starter', async () => {
            const result = await setup({
                downloadStarter: async () => {
                    throw new RegistryError(404, 'the registry answered 404: No starter is available for this project.');
                }
            }).downloadProject('project', FileUri.create(path.join(tempDir(), 'warm-up')).toString());

            expect(result).to.deep.equal({ ok: false, reason: 'the registry answered 404: No starter is available for this project.' });
        });

        it('should report network errors', async () => {
            const result = await setup({ downloadStarter: async () => { throw new TypeError('fetch failed'); } })
                .downloadProject('project', FileUri.create(path.join(tempDir(), 'warm-up')).toString());

            expect(result).to.deep.equal({ ok: false, reason: 'fetch failed' });
        });
    });

    describe('getProjectInfo', () => {
        it('should return the project', async () => {
            const project = { projectId: 'project', title: 'Warm up' } as Project;
            expect(await setup({ project: async () => project }).getProjectInfo('project')).to.deep.equal({ kind: 'found', project });
        });

        it('should say when there is no such project', async () => {
            const lookup = await setup({ project: async () => { throw new RegistryError(404, 'not found'); } }).getProjectInfo('project');
            expect(lookup).to.deep.equal({ kind: 'not-found' });
        });

        it('should say when nobody is logged in', async () => {
            const lookup = await setup({ project: async () => { throw new NotLoggedIn('not logged in; run `yukibana login`'); } }, false).getProjectInfo('project');
            expect(lookup).to.deep.equal({ kind: 'not-logged-in' });
        });

        it('should say when the registry refuses the session', async () => {
            const lookup = await setup({ project: async () => { throw new RegistryError(401, 'the registry answered 401'); } }).getProjectInfo('project');
            expect(lookup).to.deep.equal({ kind: 'not-logged-in' });
        });

        it('should report other failures rather than call them not found', async () => {
            const error = await setup({ project: async () => { throw new RegistryError(500, 'the registry answered 500'); } })
                .getProjectInfo('project').then(() => undefined, e => e);
            expect(error).to.be.instanceOf(RegistryError);
        });
    });

    describe('listProjects', () => {
        it('should return the projects the registry shows', async () => {
            const projects = [{ projectId: 'project', title: 'Warm up' } as Project];
            expect(await setup({ projects: async () => projects }).listProjects()).to.deep.equal({ kind: 'found', projects });
        });

        it('should say when nobody is logged in', async () => {
            const listing = await setup({ projects: async () => { throw new NotLoggedIn('not logged in; run `yukibana login`'); } }, false).listProjects();
            expect(listing).to.deep.equal({ kind: 'not-logged-in' });
        });

        it('should say when the registry refuses the session', async () => {
            const listing = await setup({ projects: async () => { throw new RegistryError(401, 'the registry answered 401'); } }).listProjects();
            expect(listing).to.deep.equal({ kind: 'not-logged-in' });
        });

        it('should give the reason when the registry cannot answer, rather than an empty list', async () => {
            const listing = await setup({ projects: async () => { throw new RegistryError(500, 'the registry answered 500'); } }).listProjects();
            expect(listing).to.deep.equal({ kind: 'error', reason: 'the registry answered 500' });
        });
    });

    describe('submit', () => {
        it('should send the prepared submission for the project', async () => {
            let sent: { bundle: SubmissionBundle, projectId: string | undefined } | undefined;
            const service = setup({
                submit: (async (bundle: SubmissionBundle, projectId?: string) => {
                    sent = { bundle, projectId };
                    return { submissionId: 'submission' };
                }) as unknown as CloudClient['submit']
            });

            const result = await service.submit('project', PREPARED);

            expect(result).to.deep.equal({ ok: true, submissionId: 'submission' });
            expect(sent).to.deep.equal({ bundle: prepared, projectId: 'project' });
        });

        it('should report a failed upload', async () => {
            const result = await setup({ submit: async () => { throw new RegistryError(413, 'too large'); } }).submit('project', PREPARED);

            expect(result).to.deep.equal({ ok: false, reason: 'too large' });
        });

        it('should refuse a submission that is no longer prepared', async () => {
            const result = await setup({}).submit('project', 'gone');

            expect(result.ok).to.equal(false);
        });
    });
});

