/**
 * SPDX-License-Identifier: MIT
 */
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDom = enableJSDOM();
FrontendApplicationConfigProvider.set({});

import { Disposable, Emitter, ILogger, URI } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { FileService, ReadTextFileOptions, TextFileContent } from '@theia/filesystem/lib/browser/file-service';
import { FileChangesEvent, FileChangeType, FileStat, WatchOptions } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { expect } from 'chai';
import { loadConfig } from '../../common/yukibana-config';
import { ConfigProvider } from './config-provider';
import { ReadOnlyPolicy } from './read-only-policy';

interface MockFileService extends Pick<FileService, 'exists' | 'read' | 'watch' | 'onDidFilesChange'> {
    write(resource: URI, content: string): void
    delete(resource: URI): void
}

interface MockWorkspaceService extends Pick<WorkspaceService, 'ready' | 'onWorkspaceChanged' | 'tryGetRoots'> {
    markReady(): void
    setRoot(root: URI): void
}

function createMockFileService(files: Record<string, string>): MockFileService {
    const watched: Set<string> = new Set<string>();
    const changeEmitter = new Emitter<FileChangesEvent>();
    return {
        exists: async (resource: URI): Promise<boolean> => resource.toString() in files,
        read: async (resource: URI, options?: ReadTextFileOptions): Promise<TextFileContent> => {
            const doc = files[resource.toString()];
            if (doc === undefined) {
                throw new Error();
            }
            return {
                ctime: 0,
                encoding: 'utf-8',
                etag: '',
                mtime: 0,
                name: '',
                resource: resource,
                size: doc.length,
                value: doc,
            };
        },
        watch: (resource: URI, options: WatchOptions): Disposable => Disposable.create(
            () => watched.delete(resource.toString())
        ),
        onDidFilesChange: changeEmitter.event,
        write: (resource: URI, content: string) => {
            const path = resource.toString();
            const added = files[path] === undefined;
            files[path] = content;
            changeEmitter.fire(new FileChangesEvent([
                {
                    resource: resource,
                    type: added ? FileChangeType.ADDED : FileChangeType.UPDATED,
                }
            ]));
        },
        delete: (resource: URI): void => {
            const path = resource.toString();
            if (files[path] === undefined) {
                return;
            }
            delete files[path];
            changeEmitter.fire(new FileChangesEvent([
                {
                    resource: resource,
                    type: FileChangeType.DELETED,
                }
            ]));
        }
    };
}

function createMockWorkspaceService(initialRoot?: URI): MockWorkspaceService {
    const ready = new Deferred<void>();
    const changeEmitter = new Emitter<FileStat[]>();
    let root: URI | undefined = initialRoot;
    const getRoots = (): FileStat[] => root ? [
        {
            resource: root,
            name: root.path.base || root.path.toString(),
            isFile: false,
            isDirectory: true,
            isSymbolicLink: false,
            isReadonly: false,
            mtime: 0,
            ctime: 0,
            size: 0,
            etag: '',
        },
    ] : [];
    return {
        ready: ready.promise,
        markReady: () => ready.resolve(),
        setRoot: (newRoot: URI) => {
            root = newRoot;
            changeEmitter.fire(getRoots());
        },
        tryGetRoots: (): FileStat[] => getRoots(),
        onWorkspaceChanged: changeEmitter.event,
    };
}

disableJSDom();

describe('ConfigProvider', () => {
    let readOnlyPolicy: ReadOnlyPolicy;

    before(() => {
        disableJSDom = enableJSDOM();
    });
    after(() => {
        disableJSDom();
    });

    beforeEach(() => {
        readOnlyPolicy = new ReadOnlyPolicy();
    });

    it('should apply defaults if not config file can be found', async () => {
        const mockFileService = createMockFileService({});
        const mockWorkspaceService = createMockWorkspaceService();
        const mockILogger: ILogger = new MockLogger();
        const provider = new ConfigProvider(
            mockFileService as unknown as FileService,
            mockWorkspaceService as unknown as WorkspaceService,
            readOnlyPolicy,
            mockILogger,
        );

        mockWorkspaceService.markReady();
        await provider.onStart();
        const config = await provider.ready;
        const defaultConfig = loadConfig({});
        expect(config).to.deep.equal(defaultConfig);
    });
});
