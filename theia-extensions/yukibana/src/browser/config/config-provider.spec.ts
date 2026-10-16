/**
 * SPDX-License-Identifier: MIT
 */
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

const disableJSDom = enableJSDOM();
FrontendApplicationConfigProvider.set({});

import { Disposable, Emitter, Event, URI } from '@theia/core';
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

interface MockServices {
    readOnlyPolicy: ReadOnlyPolicy;
    fileService: MockFileService;
    workspaceService: MockWorkspaceService;
    logger: MockLogger;
    provider: ConfigProvider;
}

function setup(initialRoot?: URI): MockServices {
    const readOnlyPolicy = new ReadOnlyPolicy();
    const fileService = createMockFileService({});
    const workspaceService = createMockWorkspaceService();
    const logger = new MockLogger();
    const provider = new ConfigProvider(
        fileService as unknown as FileService,
        workspaceService as unknown as WorkspaceService,
        readOnlyPolicy,
        logger,
    );
    if (!!initialRoot) {
        workspaceService.setRoot(initialRoot);
    }
    workspaceService.markReady();
    return {
        readOnlyPolicy,
        fileService,
        workspaceService,
        logger,
        provider,
    };
}

disableJSDom();

describe('ConfigProvider', () => {
    const root = new URI('file:///');

    it('should apply defaults if no workspace root is defined', async () => {
        const { provider } = setup();
        await provider.onStart();

        const config = await provider.ready;
        const defaultConfig = loadConfig({});
        expect(config).to.deep.equal(defaultConfig);
    });

    it('should apply defaults if not config file can be found', async () => {
        const { provider } = setup(root);
        await provider.onStart();

        const config = await provider.ready;
        const defaultConfig = loadConfig({});
        expect(config).to.deep.equal(defaultConfig);
    });

    it('should apply defaults if the config is invalid', async () => {
        const { provider, fileService } = setup(root);
        fileService.write(root.resolve('yukibana.json'), 'invalid JSON');
        await provider.onStart();

        const config = await provider.ready;
        const defaultConfig = loadConfig({});
        expect(config).to.deep.equal(defaultConfig);
    });

    it('should load a valid config file', async () => {
        const { provider, fileService } = setup(root);
        fileService.write(root.resolve('yukibana.json'), '{"projectId": "valid-id"}');
        await provider.onStart();

        const config = await provider.ready;
        const defaultConfig = loadConfig({});
        expect(config).to.deep.equal({ ...defaultConfig, projectId: 'valid-id' });
        expect(config).to.deep.equal(provider.config);
    });

    it('should reload if the config has changed', async () => {
        const { provider, fileService } = setup(root);
        fileService.write(root.resolve('yukibana.json'), '{"projectId": "valid-id"}');
        await provider.onStart();

        await provider.ready;
        const configChanged = Event.toPromise(provider.onConfigChanged);
        fileService.write(root.resolve('yukibana.json'), '{"projectId": "new-id"}');
        const newConfig = await configChanged;
        const defaultConfig = loadConfig({});
        expect(newConfig).to.deep.equal({ ...defaultConfig, projectId: 'new-id' });
        expect(newConfig).to.deep.equal(provider.config);
    });

    it('should reload if the workspace root has changed', async () => {
        const root2 = new URI('file:///root2');
        const { provider, fileService, workspaceService } = setup(root);
        fileService.write(root.resolve('yukibana.json'), '{"projectId": "valid-id"}');
        fileService.write(root2.resolve('yukibana.json'), '{"projectId": "new-id"}');
        await provider.onStart();

        await provider.ready;
        const configChanged = Event.toPromise(provider.onConfigChanged);
        workspaceService.setRoot(root2);
        const newConfig = await configChanged;
        const defaultConfig = loadConfig({});
        expect(newConfig).to.deep.equal({ ...defaultConfig, projectId: 'new-id' });
        expect(newConfig).to.deep.equal(provider.config);
    });
});
