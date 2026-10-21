/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { FileUri } from '@theia/core/lib/node';
import { Project, RegistryError } from '@yukibana/cli';
import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as tar from 'tar';
import { CloudClient } from './cloud-client';
import { CloudServiceImpl } from './cloud-service';

type MockClient = Partial<Pick<CloudClient, 'downloadStarter' | 'project' | 'submitArchive'>>;

function setup(client: MockClient): CloudServiceImpl {
    const service = new CloudServiceImpl();
    Object.assign(service, {
        client: client as CloudClient,
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

function samePath(actual: string, expected: string): void {
    // FileUri lowercases the drive letter on Windows
    expect(path.normalize(actual).toLowerCase()).to.equal(path.normalize(expected).toLowerCase());
}

describe('CloudServiceImpl', () => {
    after(() => {
        for (const dir of tempDirs) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    describe('downloadProject', () => {
        it('should open the top-level directory of the starter', async () => {
            const starter = await tarball({ 'warmup/Cargo.toml': '[package]', 'warmup/src/main.rs': 'fn main() {}' });
            const destination = tempDir();
            const result = await setup({ downloadStarter: async () => starter })
                .downloadProject('project', FileUri.create(destination).toString());

            expect(result.ok).to.equal(true);
            if (result.ok) {
                samePath(FileUri.fsPath(result.uri.toString()), path.join(destination, 'warmup'));
            }
            expect(fs.readFileSync(path.join(destination, 'warmup', 'src', 'main.rs'), 'utf8')).to.equal('fn main() {}');
        });

        it('should open the destination if the starter has several top-level entries', async () => {
            const starter = await tarball({ 'Cargo.toml': '[package]', 'src/main.rs': 'fn main() {}' });
            const destination = tempDir();
            const result = await setup({ downloadStarter: async () => starter })
                .downloadProject('project', FileUri.create(destination).toString());

            expect(result.ok).to.equal(true);
            if (result.ok) {
                samePath(FileUri.fsPath(result.uri.toString()), destination);
            }
            expect(fs.existsSync(path.join(destination, 'Cargo.toml'))).to.equal(true);
        });

        it('should open the destination if the starter is a single file', async () => {
            const starter = await tarball({ 'README.md': '# Warm up' });
            const destination = tempDir();
            const result = await setup({ downloadStarter: async () => starter })
                .downloadProject('project', FileUri.create(destination).toString());

            expect(result.ok).to.equal(true);
            if (result.ok) {
                samePath(FileUri.fsPath(result.uri.toString()), destination);
            }
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
            const result = await setup({ downloadStarter: async () => new Uint8Array([1, 2, 3, 4, 5]) })
                .downloadProject('project', FileUri.create(tempDir()).toString());

            expect(result.ok).to.equal(false);
            if (!result.ok) {
                expect(result.reason).to.contain('TAR_BAD_ARCHIVE');
            }
        });
    });

    describe('getProjectInfo', () => {
        it('should return the project', async () => {
            const project = { projectId: 'project', title: 'Warm up' } as Project;
            const info = await setup({ project: async () => project }).getProjectInfo('project');
            expect(info).to.equal(project);
        });

        it('should return undefined if the request fails', async () => {
            const info = await setup({ project: async () => { throw new RegistryError(404, 'not found'); } }).getProjectInfo('project');
            expect(info).to.equal(undefined);
        });
    });

    describe('submit', () => {
        it('should upload the archive bytes', async () => {
            const archive = path.join(tempDir(), 'submission.tar.gz');
            fs.writeFileSync(archive, Buffer.from([1, 2, 3]));
            let uploaded: { projectId: string, bytes: Uint8Array } | undefined;
            const service = setup({
                submitArchive: (async (projectId: string, bytes: Uint8Array) => {
                    uploaded = { projectId, bytes };
                    return { submissionId: 'submission' };
                }) as unknown as CloudClient['submitArchive']
            });

            const result = await service.submit('project', FileUri.create(archive).toString());

            expect(result).to.deep.equal({ ok: true, submissionId: 'submission' });
            expect(uploaded?.projectId).to.equal('project');
            expect([...uploaded!.bytes]).to.deep.equal([1, 2, 3]);
        });

        it('should report a failed upload', async () => {
            const archive = path.join(tempDir(), 'submission.tar.gz');
            fs.writeFileSync(archive, Buffer.from([1, 2, 3]));
            const result = await setup({ submitArchive: async () => { throw new RegistryError(413, 'too large'); } })
                .submit('project', FileUri.create(archive).toString());

            expect(result).to.deep.equal({ ok: false, reason: 'too large' });
        });
    });
});
