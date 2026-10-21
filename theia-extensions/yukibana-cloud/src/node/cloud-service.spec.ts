/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { FileUri } from '@theia/core/lib/node';
import { NotLoggedIn, Project, RegistryError } from '@yukibana/cli';
import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as tar from 'tar';
import { DownloadResult } from '../common/cloud-protocol';
import { CloudClient } from './cloud-client';
import { CloudServiceImpl } from './cloud-service';
import { CloudSessionManager } from './cloud-session-manager';

type MockClient = Partial<Pick<CloudClient, 'downloadStarter' | 'project' | 'submitArchive'>>;

function setup(client: MockClient, loggedIn: boolean = true): CloudServiceImpl {
    const service = new CloudServiceImpl();
    Object.assign(service, {
        client: client as CloudClient,
        sessions: { isLoggedIn: async () => loggedIn } as CloudSessionManager,
        logger: new MockLogger() as ILogger,
    });
    return service;
}

/** Packs `files` (relative path → content) into a gzipped tarball. */
async function tarball(files: Record<string, string>): Promise<Uint8Array> {
    const source = tempDir();
    for (const [name, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(source, name)), { recursive: true });
        fs.writeFileSync(path.join(source, name), content);
    }
    const archive = path.join(tempDir(), 'starter.tar.gz');
    await tar.c({ gzip: true, cwd: source, file: archive }, fs.readdirSync(source));
    return new Uint8Array(fs.readFileSync(archive));
}

const tempDirs: string[] = [];

function tempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yukibana-cloud-spec-'));
    tempDirs.push(dir);
    return dir;
}

/** Downloads `starter` into a fresh folder. */
async function download(starter: Uint8Array): Promise<{ result: DownloadResult, destination: string }> {
    const destination = tempDir();
    const result = await setup({ downloadStarter: async () => starter }).downloadProject('project', FileUri.create(destination).toString());
    return { result, destination };
}

function expectOpened(result: DownloadResult, expected: string): void {
    expect(result.ok).to.equal(true);
    if (result.ok) {
        // FileUri lowercases the drive letter on Windows
        expect(path.normalize(FileUri.fsPath(result.uri.toString())).toLowerCase()).to.equal(path.normalize(expected).toLowerCase());
    }
}

/** A submission archive on disk, whose bytes are [1, 2, 3]. */
function archiveFile(): string {
    const archive = path.join(tempDir(), 'submission.tar.gz');
    fs.writeFileSync(archive, Buffer.from([1, 2, 3]));
    return FileUri.create(archive).toString();
}

describe('CloudServiceImpl', () => {
    after(() => {
        for (const dir of tempDirs) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    describe('downloadProject', () => {
        it('should open the top-level directory of the starter', async () => {
            const { result, destination } = await download(await tarball({ 'warmup/Cargo.toml': '[package]', 'warmup/src/main.rs': 'fn main() {}' }));

            expectOpened(result, path.join(destination, 'warmup'));
            expect(fs.readFileSync(path.join(destination, 'warmup', 'src', 'main.rs'), 'utf8')).to.equal('fn main() {}');
        });

        it('should open the destination if the starter has several top-level entries', async () => {
            const { result, destination } = await download(await tarball({ 'Cargo.toml': '[package]', 'src/main.rs': 'fn main() {}' }));

            expectOpened(result, destination);
            expect(fs.existsSync(path.join(destination, 'Cargo.toml'))).to.equal(true);
        });

        it('should open the destination if the starter is a single file', async () => {
            const { result, destination } = await download(await tarball({ 'README.md': '# Warm up' }));

            expectOpened(result, destination);
        });

        it('should report the registry error if there is no starter', async () => {
            const result = await setup({
                downloadStarter: async () => {
                    throw new RegistryError(404, 'the registry answered 404: No starter is available for this project.');
                }
            }).downloadProject('project', FileUri.create(tempDir()).toString());

            expect(result).to.deep.equal({ ok: false, reason: 'the registry answered 404: No starter is available for this project.' });
        });

        it('should report network errors', async () => {
            const result = await setup({ downloadStarter: async () => { throw new TypeError('fetch failed'); } })
                .downloadProject('project', FileUri.create(tempDir()).toString());

            expect(result).to.deep.equal({ ok: false, reason: 'fetch failed' });
        });

        it('should report a corrupt archive', async () => {
            const { result } = await download(new Uint8Array([1, 2, 3, 4, 5]));

            expect(result.ok).to.equal(false);
            if (!result.ok) {
                expect(result.reason).to.contain('TAR_BAD_ARCHIVE');
            }
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

    describe('submit', () => {
        it('should upload the archive bytes', async () => {
            let uploaded: { projectId: string, bytes: Uint8Array } | undefined;
            const service = setup({
                submitArchive: (async (projectId: string, bytes: Uint8Array) => {
                    uploaded = { projectId, bytes };
                    return { submissionId: 'submission' };
                }) as unknown as CloudClient['submitArchive']
            });

            const result = await service.submit('project', archiveFile());

            expect(result).to.deep.equal({ ok: true, submissionId: 'submission' });
            expect(uploaded?.projectId).to.equal('project');
            expect([...uploaded!.bytes]).to.deep.equal([1, 2, 3]);
        });

        it('should report a failed upload', async () => {
            const result = await setup({ submitArchive: async () => { throw new RegistryError(413, 'too large'); } }).submit('project', archiveFile());

            expect(result).to.deep.equal({ ok: false, reason: 'too large' });
        });
    });
});
