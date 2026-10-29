/**
 * SPDX-License-Identifier: MIT
 */
// @vitest-environment jsdom
import { URI } from '@theia/core';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { Project } from '@yukibana/cli';
import { expect } from 'chai';
import { describe, it } from 'vitest';
import { folderNameProblem, ProjectLocations } from './project-locations';

const PROJECT_ID = '01a11653-0353-7389-81f4-01837a3ed666';
const OTHER_PROJECT_ID = '01a11653-0353-7389-81f4-01837a3ed667';
const project = { projectId: PROJECT_ID, slug: 'warmup', title: 'Warm up' } as Project;

/** A folder or file on the fake disk: a folder lists its children, a file has its text. */
type Node = { readonly kind: 'folder'; readonly link?: boolean } | { readonly kind: 'file'; readonly text: string };

/** Returns `ProjectLocations` over a disk holding `nodes`, keyed by path, with `recent` opened lately and `home` as the home folder. */
function locations(nodes: Record<string, Node>, recent: string[] = [], home = '/home/student'): ProjectLocations {
    const at = (uri: URI): Node | undefined => nodes[uri.path.toString()];
    const files = {
        exists: async (uri: URI) => at(uri) !== undefined,
        resolve: async (uri: URI) => {
            const node = at(uri);
            const prefix = `${uri.path.toString()}/`;
            const children = Object.keys(nodes).filter(p => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'));
            return {
                isDirectory: node?.kind === 'folder',
                isSymbolicLink: node?.kind === 'folder' && node.link === true,
                children: children.map(p => ({ resource: new URI(`file://${p}`) })),
            };
        },
        read: async (uri: URI) => {
            const node = at(uri);
            if (node?.kind !== 'file') {
                throw new Error(`no file ${uri.toString()}`);
            }
            return { value: node.text };
        },
    };
    const result = new ProjectLocations();
    Object.assign(result, {
        files: files as unknown as FileService,
        workspaces: { recentWorkspaces: async () => recent.map(p => `file://${p}`) } as unknown as WorkspaceService,
        env: { getHomeDirUri: async () => `file://${home}` } as unknown as EnvVariablesServer,
    });
    return result;
}

const config = (projectId: string): Node => ({ kind: 'file', text: JSON.stringify({ projectId }) });
const folder: Node = { kind: 'folder' };
const fileAt = (path: string): URI => new URI(`file://${path}`);

describe('folderNameProblem', () => {
    it('should accept a plain name', () => {
        expect(folderNameProblem('warmup')).to.equal(undefined);
        expect(folderNameProblem('Lab 3 (sorting)')).to.equal(undefined);
    });

    it('should refuse what is not one folder name', () => {
        for (const name of ['', '   ', ' warmup', 'warmup ', '.', '..', 'a/b', '../escaped', 'a\\b', 'C:x', 'what?', 'tab\tname']) {
            expect(folderNameProblem(name), JSON.stringify(name)).to.be.a('string');
        }
    });
});

describe('ProjectLocations', () => {
    describe('stateOf', () => {
        it('should tell a missing or empty folder, a copy of the project, other files and a file apart', async () => {
            const l = locations({
                '/p/empty': folder,
                '/p/copy': folder,
                '/p/copy/yukibana.json': config(PROJECT_ID),
                '/p/other': folder,
                '/p/other/yukibana.json': config(OTHER_PROJECT_ID),
                '/p/notes': folder,
                '/p/notes/notes.txt': { kind: 'file', text: 'hello' },
                '/p/file': { kind: 'file', text: '' },
            });

            expect(await l.stateOf(fileAt('/p/missing'), PROJECT_ID)).to.equal('free');
            expect(await l.stateOf(fileAt('/p/empty'), PROJECT_ID)).to.equal('free');
            expect(await l.stateOf(fileAt('/p/copy'), PROJECT_ID)).to.equal('this-project');
            expect(await l.stateOf(fileAt('/p/other'), PROJECT_ID)).to.equal('other-files');
            expect(await l.stateOf(fileAt('/p/notes'), PROJECT_ID)).to.equal('other-files');
            expect(await l.stateOf(fileAt('/p/file'), PROJECT_ID)).to.equal('not-a-folder');
        });

        it('should not count a link as a free folder, since a starter is never unpacked through one', async () => {
            const l = locations({ '/p/link': { kind: 'folder', link: true }, '/p/copy-link': { kind: 'folder', link: true }, '/p/copy-link/yukibana.json': config(PROJECT_ID) });

            expect(await l.stateOf(fileAt('/p/link'), PROJECT_ID)).to.equal('not-a-folder');
            expect(await l.stateOf(fileAt('/p/copy-link'), PROJECT_ID)).to.equal('this-project');
        });
    });

    describe('defaultDestination', () => {
        it('should suggest a folder named after the slug next to the most recently opened workspace', async () => {
            const l = locations({ '/home/student/code/lab1': folder }, ['/home/student/code/lab1', '/srv/old/lab0']);
            expect((await l.defaultDestination(project)).path.toString()).to.equal('/home/student/code/warmup');
        });

        it('should suggest the home folder when nothing was opened yet', async () => {
            expect((await locations({}).defaultDestination(project)).path.toString()).to.equal('/home/student/warmup');
        });

        it('should suggest the folder next to a recent workspace file', async () => {
            const l = locations({}, ['/home/student/course/course.theia-workspace']);
            expect((await l.defaultDestination(project)).path.toString()).to.equal('/home/student/course/warmup');
        });

        it('should suggest a copy of the project among the recent workspaces, wherever it is', async () => {
            const l = locations({ '/srv/labs/my-warmup': folder, '/srv/labs/my-warmup/yukibana.json': config(PROJECT_ID) }, ['/home/student/code/lab1', '/srv/labs/my-warmup']);
            expect((await l.defaultDestination(project)).path.toString()).to.equal('/srv/labs/my-warmup');
        });

        it('should number the folder name past folders that hold something else', async () => {
            const l = locations(
                {
                    '/home/student/warmup': folder,
                    '/home/student/warmup/notes.txt': { kind: 'file', text: '' },
                    '/home/student/warmup-1': { kind: 'file', text: '' },
                },
                [],
            );
            expect((await l.defaultDestination(project)).path.toString()).to.equal('/home/student/warmup-2');
        });

        it('should suggest a copy of the project where its folder would go, even if it was not opened lately', async () => {
            const l = locations({ '/home/student/warmup': folder, '/home/student/warmup/yukibana.json': config(PROJECT_ID) });
            expect((await l.defaultDestination(project)).path.toString()).to.equal('/home/student/warmup');
        });
    });

    describe('projectIdAt', () => {
        it("should read the project id of a folder's yukibana.json, and nothing without one", async () => {
            const l = locations({ '/p/copy': folder, '/p/copy/yukibana.json': config(PROJECT_ID), '/p/plain': folder });
            expect(await l.projectIdAt(fileAt('/p/copy'))).to.equal(PROJECT_ID);
            expect(await l.projectIdAt(fileAt('/p/plain'))).to.equal(undefined);
        });
    });
});
