/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger } from '@theia/core';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { FileUri } from '@theia/core/lib/node';
import { Entry, Project, writeTar } from '@yukibana/cli';
import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, describe, it } from 'vitest';
import * as zlib from 'zlib';
import { UpdateResult, UpdateState } from '../../common/update-protocol';
import { CloudClient } from '../cloud-client';
import { UpdateServiceImpl } from './update-service';

const PROJECT = '00000000-0000-7000-8000-0000000000aa';
const V1 = '00000000-0000-7000-8000-000000000001';
const V2 = '00000000-0000-7000-8000-000000000002';
const READ_ONLY = ['tests/**'];

const config = (release: string, readOnly = READ_ONLY): string =>
    JSON.stringify({ version: 1, kind: 'rust-cargo', readOnly, projectId: PROJECT, releaseId: release }, undefined, 2);

/** A release's starter, as the registry serves it: a gzipped tar wrapped in one folder, as `git archive` makes them. */
async function starter(release: string, files: Record<string, string>, readOnly = READ_ONLY): Promise<Uint8Array> {
    const all = { 'yukibana.json': config(release, readOnly), ...files };
    const entries = Object.entries(all).map(([name, content]): Entry => ({ path: `warmup/${name}`, type: 'file', mode: 0o644, mtime: 1, data: new TextEncoder().encode(content) }));
    return new Uint8Array(zlib.gzipSync(await writeTar(entries)));
}

const V1_FILES = { 'src/lib.rs': 'fn a() {}\n', 'src/helpers.rs': 'helpers v1\n', 'tests/t.rs': 'test v1\n', 'README.md': 'read me\n' };
const V2_FILES = { 'src/lib.rs': 'fn a() {}\nfn b() {}\n', 'src/helpers.rs': 'helpers v2\n', 'tests/t.rs': 'test v2\n', 'src/pretty.rs': 'new\n' };

const tempDirs: string[] = [];
function tempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yukibana-update-spec-'));
    tempDirs.push(dir);
    return dir;
}

interface Setup {
    readonly service: UpdateServiceImpl;
    readonly root: string;
    readonly workspace: string;
    readonly read: (file: string) => string | undefined;
    readonly write: (file: string, content: string) => void;
    /** How often the registry was asked for a starter. */
    readonly downloads: () => number;
}

/** A student folder unpacked from v1, with `current` as the registry's newest release. */
async function setup(options: { current?: string | null; v2?: Record<string, string>; v2ReadOnly?: string[]; projectFails?: boolean } = {}): Promise<Setup> {
    const releases = new Map([
        [V1, await starter(V1, V1_FILES)],
        [V2, await starter(V2, options.v2 ?? V2_FILES, options.v2ReadOnly)],
    ]);
    let downloads = 0;
    const client = {
        project: async (id: string) => {
            if (options.projectFails) {
                throw new Error('the registry could not be reached');
            }
            // The registry says "no deadline" with null
            // oxlint-disable-next-line unicorn/no-null
            return { projectId: id, title: 'Warm-up', deadline: null, currentReleaseId: options.current === undefined ? V2 : options.current } as Project;
        },
        downloadRelease: async (id: string) => {
            downloads++;
            const found = releases.get(id);
            if (!found) {
                throw new Error('404');
            }
            return found;
        },
    } as unknown as CloudClient;
    const configDir = tempDir();
    const service = new UpdateServiceImpl();
    Object.assign(service, {
        client,
        env: { getConfigDirUri: async () => FileUri.create(configDir).toString() } as EnvVariablesServer,
        logger: new MockLogger() as ILogger,
    });
    const root = tempDir();
    const write = (file: string, content: string): void => {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), content);
    };
    write('yukibana.json', config(V1));
    for (const [file, content] of Object.entries(V1_FILES)) {
        write(file, content);
    }
    const read = (file: string): string | undefined => (fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : undefined);
    return { service, root, workspace: FileUri.create(root).toString(), read, write, downloads: () => downloads };
}

const stampOf = (s: Setup): string | undefined => JSON.parse(s.read('yukibana.json') ?? '{}').releaseId;

function updated(result: UpdateResult): UpdateState {
    expect(result.kind, JSON.stringify(result)).to.equal('updated');
    return (result as { state: UpdateState }).state;
}

describe('UpdateServiceImpl', () => {
    afterAll(() => {
        for (const dir of tempDirs) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('offers a newer release with every file it would touch, and writes nothing while checking', async () => {
        const s = await setup();
        s.write('src/lib.rs', 'fn a() { mine }\n');
        const state = await s.service.check(s.workspace);
        expect(state.available?.projectTitle).to.equal('Warm-up');
        expect(state.available?.to).to.equal(V2);
        expect(state.available?.decided.map(r => `${r.kind} ${r.path}`)).to.deep.equal(['delete README.md', 'write src/helpers.rs', 'write src/pretty.rs', 'write tests/t.rs']);
        expect(state.available?.pending.map(r => `${r.kind} ${r.path}`)).to.deep.equal(['merge src/lib.rs']);
        expect(stampOf(s)).to.equal(V1);
        expect(s.read('src/helpers.rs')).to.equal('helpers v1\n');
    });

    it('updates the decided files and the stamp, keeps a file both changed as the student had it, and leaves it to merge', async () => {
        const s = await setup();
        s.write('src/lib.rs', 'fn a() { mine }\n');
        const state = updated(await s.service.update(s.workspace, V2, []));
        expect(stampOf(s)).to.equal(V2);
        expect(s.read('src/helpers.rs')).to.equal('helpers v2\n');
        expect(s.read('tests/t.rs')).to.equal('test v2\n');
        expect(s.read('src/pretty.rs')).to.equal('new\n');
        expect(s.read('README.md')).to.equal(undefined);
        expect(s.read('src/lib.rs')).to.equal('fn a() { mine }\n');
        expect(state.available).to.equal(undefined);
        expect(state.last?.pending.map(r => r.path)).to.deep.equal(['src/lib.rs']);
        // The merge editor's three sides
        expect(await s.service.read(s.workspace, { kind: 'release', release: V1 }, 'src/lib.rs')).to.equal('fn a() {}\n');
        expect(await s.service.read(s.workspace, { kind: 'release', release: V2 }, 'src/lib.rs')).to.equal('fn a() {}\nfn b() {}\n');
        expect(await s.service.read(s.workspace, { kind: 'before' }, 'src/lib.rs')).to.equal('fn a() { mine }\n');
    });

    it("asks before replacing the student's edits in a read-only file, and writes nothing until they agree", async () => {
        const s = await setup();
        s.write('tests/t.rs', 'test v1, weakened\n');
        const asked = await s.service.update(s.workspace, V2, []);
        expect(asked).to.deep.equal({ kind: 'confirm', paths: ['tests/t.rs'] });
        expect(stampOf(s)).to.equal(V1);
        expect(s.read('src/helpers.rs')).to.equal('helpers v1\n');
        updated(await s.service.update(s.workspace, V2, ['tests/t.rs']));
        expect(s.read('tests/t.rs')).to.equal('test v2\n');
        expect(await s.service.read(s.workspace, { kind: 'before' }, 'tests/t.rs')).to.equal('test v1, weakened\n', 'their old version can still be opened');
    });

    it('undoes an update completely, merges included, and asks first when a file changed since', async () => {
        const s = await setup();
        s.write('src/lib.rs', 'fn a() { mine }\n');
        updated(await s.service.update(s.workspace, V2, []));
        s.write('src/lib.rs', 'fn a() { mine }\nfn b() {}\n');
        const asked = await s.service.undo(s.workspace, false);
        expect(asked).to.deep.equal({ kind: 'confirm', paths: ['src/lib.rs'] });
        expect(stampOf(s)).to.equal(V2);
        const undone = await s.service.undo(s.workspace, true);
        expect(undone.kind).to.equal('undone');
        expect(stampOf(s)).to.equal(V1);
        expect(s.read('src/lib.rs')).to.equal('fn a() { mine }\n');
        expect(s.read('src/helpers.rs')).to.equal('helpers v1\n');
        expect(s.read('README.md')).to.equal('read me\n');
        expect(s.read('src/pretty.rs')).to.equal(undefined, 'a file the update added is removed');
        expect((undone as { state: UpdateState }).state.available?.to).to.equal(V2, 'and the update is offered again');
    });

    it("settles what is left: the teacher's version, or the student's", async () => {
        const s = await setup({ v2: { ...V1_FILES, 'src/helpers.rs': 'helpers v2\n', 'src/lib.rs': 'fn a() {}\nfn b() {}\n' } });
        s.write('src/helpers.rs', 'my helpers\n');
        s.write('src/lib.rs', 'fn a() { mine }\n');
        const state = updated(await s.service.update(s.workspace, V2, []));
        expect(state.last?.pending.map(r => r.path)).to.deep.equal(['src/helpers.rs', 'src/lib.rs']);
        const afterTeacher = await s.service.resolve(s.workspace, 'src/helpers.rs', 'teacher');
        expect(s.read('src/helpers.rs')).to.equal('helpers v2\n');
        expect(afterTeacher.last?.pending.map(r => r.path)).to.deep.equal(['src/lib.rs']);
        const afterKeep = await s.service.resolve(s.workspace, 'src/lib.rs', 'keep');
        expect(s.read('src/lib.rs')).to.equal('fn a() { mine }\n');
        expect(afterKeep.last?.pending).to.deep.equal([]);
    });

    it('moves the stamp without a word when nothing the student receives changed', async () => {
        const s = await setup({ v2: V1_FILES });
        s.write('src/lib.rs', 'fn a() { mine }\n');
        const state = await s.service.check(s.workspace);
        expect(state.available).to.equal(undefined);
        expect(stampOf(s)).to.equal(V2);
        expect(s.read('src/lib.rs')).to.equal('fn a() { mine }\n');
    });

    it('rolls back an update the IDE stopped in the middle of', async () => {
        const s = await setup();
        updated(await s.service.update(s.workspace, V2, []));
        // As if it had stopped after writing: mark the record as still applying
        const folders = path.join(FileUri.fsPath(await (s.service as unknown as { env: EnvVariablesServer }).env.getConfigDirUri()), 'updates', 'folders');
        const [dir] = fs.readdirSync(folders);
        const manifest = path.join(folders, dir!, 'manifest.json');
        fs.writeFileSync(manifest, JSON.stringify({ ...JSON.parse(fs.readFileSync(manifest, 'utf8')), state: 'applying' }));
        const state = await s.service.check(s.workspace);
        expect(state.rolledBack).to.equal(true);
        expect(stampOf(s)).to.equal(V1);
        expect(s.read('src/helpers.rs')).to.equal('helpers v1\n');
        expect(state.available?.to).to.equal(V2);
    });

    it('downloads a release once, and reads it from the cache after', async () => {
        const s = await setup();
        await s.service.check(s.workspace);
        await s.service.check(s.workspace);
        updated(await s.service.update(s.workspace, V2, []));
        expect(s.downloads()).to.equal(2);
    });

    it('says nothing for a folder already on the newest release, and why when the registry cannot be asked', async () => {
        const up = await setup({ current: V1 });
        expect(await up.service.check(up.workspace)).to.deep.equal({ rolledBack: false });
        const offline = await setup({ projectFails: true });
        expect((await offline.service.check(offline.workspace)).problem).to.equal('the registry could not be reached');
        const unstamped = await setup();
        fs.writeFileSync(path.join(unstamped.root, 'yukibana.json'), JSON.stringify({ version: 1, kind: 'rust-cargo' }));
        expect(await unstamped.service.check(unstamped.workspace)).to.deep.equal({ rolledBack: false });
    });

    it('never writes through a symlink the student put where a file goes', async () => {
        const s = await setup();
        const outside = path.join(tempDir(), 'outside.txt');
        fs.writeFileSync(outside, 'not the project\n');
        fs.rmSync(path.join(s.root, 'tests/t.rs'));
        fs.symlinkSync(outside, path.join(s.root, 'tests/t.rs'));
        updated(await s.service.update(s.workspace, V2, ['tests/t.rs']));
        expect(fs.readFileSync(outside, 'utf8')).to.equal('not the project\n');
        expect(fs.lstatSync(path.join(s.root, 'tests/t.rs')).isFile()).to.equal(true);
        await s.service.undo(s.workspace, true);
        expect(fs.lstatSync(path.join(s.root, 'tests/t.rs')).isSymbolicLink()).to.equal(true, 'undo puts the link back');
    });

    it("puts the student's files back at once when an update fails halfway, so trying again keeps their old version", async () => {
        const s = await setup();
        s.write('tests/t.rs', 'test v1, mine\n');
        const place = s.service['place'].bind(s.service);
        let fail = true;
        s.service['place'] = async (root, file, version) => {
            if (fail && file === 'yukibana.json') {
                fail = false;
                throw new Error('disk full');
            }
            return place(root, file, version);
        };
        const failed = await s.service.update(s.workspace, V2, ['tests/t.rs']);
        expect(failed.kind).to.equal('failed');
        expect(s.read('tests/t.rs')).to.equal('test v1, mine\n', 'rolled back right away');
        expect(stampOf(s)).to.equal(V1);
        updated(await s.service.update(s.workspace, V2, ['tests/t.rs']));
        expect(await s.service.read(s.workspace, { kind: 'before' }, 'tests/t.rs')).to.equal('test v1, mine\n');
        await s.service.undo(s.workspace, true);
        expect(s.read('tests/t.rs')).to.equal('test v1, mine\n', 'undo still has the edit');
    });

    it("says so and writes nothing when the student's file stands where the teacher's new version has a folder", async () => {
        const s = await setup({ v2: { ...V2_FILES, 'docs/x.md': 'x\n' } });
        s.write('docs', 'my notes\n');
        const state = await s.service.check(s.workspace);
        expect(state.problem).to.contain('docs is a file in your project');
        expect(state.available).to.equal(undefined);
        const result = await s.service.update(s.workspace, V2, []);
        expect(result.kind).to.equal('failed');
        expect(s.read('docs')).to.equal('my notes\n');
        expect(s.read('src/helpers.rs')).to.equal('helpers v1\n');
        fs.rmSync(path.join(s.root, 'docs'));
        expect((await s.service.check(s.workspace)).available?.to).to.equal(V2, 'and offers it once the way is clear');
    });

    it('refuses a release with a path that leaves the project, before writing anything', async () => {
        const s = await setup({ v2: { ...V2_FILES, '../evil.txt': 'x\n' } });
        const state = await s.service.check(s.workspace);
        expect(state.problem).to.match(/not a path inside a project|outside/);
        expect(s.read('src/helpers.rs')).to.equal('helpers v1\n');
        expect(fs.existsSync(path.join(s.root, '..', 'evil.txt'))).to.equal(false);
    });
});
