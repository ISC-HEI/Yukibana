/**
 * SPDX-License-Identifier: MIT
 */
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

const disableJSDom = enableJSDOM();
FrontendApplicationConfigProvider.set({});

import { ILogger, MessageService, URI } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { FileDialogService } from '@theia/filesystem/lib/browser';
import { TelemetryService } from '@theia/telemetry/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { Project } from '@yukibana/cli';
import { expect } from 'chai';
import { CloudService, DownloadResult } from '../common/cloud-protocol';
import { CloudTelemetry } from '../common/cloud-telemetry';
import { YukibanaOpenHandler } from './yukibana-url-handler';

disableJSDom();

class TestOpenHandler extends YukibanaOpenHandler {
    newWindow: boolean | undefined = false;

    protected override async askOpenInNewWindow(): Promise<boolean | undefined> {
        return this.newWindow;
    }
}

interface Mocks {
    handler: TestOpenHandler;
    /** Progress messages reported, and whether the notification was closed. */
    progress: { messages: string[], cancelled: number, shown: boolean };
    errors: string[];
    reports: CloudTelemetry.OpenProjectURIData[];
    opened: { uri: URI, preserveWindow?: boolean }[];
    folderDialogs: number;
    downloads: { projectId: string, destination: string }[];
}

interface Options {
    info?: () => Promise<Project | undefined>;
    folder?: URI;
    download?: () => Promise<DownloadResult>;
}

const PROJECT_ID = '01a11653-0353-7389-81f4-01837a3ed666';
const project = { projectId: PROJECT_ID, title: 'Warm up', starterReady: true } as Project;
const folder = new URI('file:///home/student/projects');
const projectUri = new URI('file:///home/student/projects/warmup');

function setup(options: Options = {}): Mocks {
    const mocks: Omit<Mocks, 'handler'> = {
        progress: { messages: [], cancelled: 0, shown: false },
        errors: [],
        reports: [],
        opened: [],
        folderDialogs: 0,
        downloads: [],
    };
    const messages = {
        showProgress: async () => {
            mocks.progress.shown = true;
            return {
                id: 'progress',
                report: ({ message }: { message?: string }) => mocks.progress.messages.push(message ?? ''),
                cancel: () => mocks.progress.cancelled++,
                result: Promise.resolve(undefined),
            };
        },
        error: async (message: string) => {
            mocks.errors.push(message);
            return undefined;
        },
    };
    const service: Partial<CloudService> = {
        getProjectInfo: options.info ?? (async () => project),
        downloadProject: async (projectId, destination) => {
            mocks.downloads.push({ projectId, destination });
            return options.download ? options.download() : { ok: true, uri: projectUri };
        },
    };
    const fileDialogs = {
        showOpenDialog: async () => {
            mocks.folderDialogs++;
            return 'folder' in options ? options.folder : folder;
        },
    };
    const workspaces = {
        open: (uri: URI, opts?: { preserveWindow?: boolean }) => mocks.opened.push({ uri, preserveWindow: opts?.preserveWindow }),
    };
    const telemetry = {
        report: (_event: string, data: CloudTelemetry.OpenProjectURIData) => mocks.reports.push(data),
    };

    const handler = new TestOpenHandler();
    Object.assign(handler, {
        logger: new MockLogger() as ILogger,
        service: service as CloudService,
        fileDialogs: fileDialogs as unknown as FileDialogService,
        workspaces: workspaces as unknown as WorkspaceService,
        messages: messages as unknown as MessageService,
        telemetry: telemetry as unknown as TelemetryService,
    });
    return { handler, ...mocks };
}

function openUri(id?: string): URI {
    return new URI(id === undefined ? 'yukibana://project/open' : `yukibana://project/open?id=${id}`);
}

describe('YukibanaOpenHandler', () => {
    describe('canHandle', () => {
        it('should handle yukibana URIs', async () => {
            const { handler } = setup();
            expect(await handler.canHandle(openUri(PROJECT_ID))).to.equal(YukibanaOpenHandler.PRIORITY);
        });

        it('should not handle other URIs', async () => {
            const { handler } = setup();
            expect(await handler.canHandle(new URI('https://cloud.yukibana.dev'))).to.equal(0);
        });
    });

    describe('open project', () => {
        it('should download and open the project', async () => {
            const mocks = setup();
            await mocks.handler.open(openUri(PROJECT_ID));

            expect(mocks.downloads).to.deep.equal([{ projectId: PROJECT_ID, destination: folder.toString() }]);
            expect(mocks.opened).to.have.length(1);
            expect(mocks.opened[0].uri.toString()).to.equal(projectUri.toString());
            expect(mocks.opened[0].preserveWindow).to.equal(true);
            expect(mocks.errors).to.have.length(0);
            expect(mocks.progress.cancelled).to.equal(1);
            expect(mocks.reports).to.have.length(1);
            expect(mocks.reports[0]).to.include({ outcome: 'opened', stage: 'window', projectId: PROJECT_ID, newWindow: false });
        });

        it('should open the project in a new window if asked to', async () => {
            const mocks = setup();
            mocks.handler.newWindow = true;
            await mocks.handler.open(openUri(PROJECT_ID));

            expect(mocks.opened[0].preserveWindow).to.equal(false);
            expect(mocks.reports[0]).to.include({ outcome: 'opened', newWindow: true });
        });

        it('should do nothing without a project id', async () => {
            const mocks = setup();
            await mocks.handler.open(openUri());

            expect(mocks.progress.shown).to.equal(false);
            expect(mocks.downloads).to.have.length(0);
            expect(mocks.reports).to.have.length(1);
            expect(mocks.reports[0]).to.include({ outcome: 'invalid-uri', stage: 'parse' });
        });

        it('should report a project that cannot be found', async () => {
            const mocks = setup({ info: async () => undefined });
            await mocks.handler.open(openUri(PROJECT_ID));

            expect(mocks.errors).to.deep.equal(['Project not found']);
            expect(mocks.folderDialogs).to.equal(0);
            expect(mocks.progress.cancelled).to.equal(1);
            expect(mocks.reports[0]).to.include({ outcome: 'not-found', stage: 'info' });
        });

        it('should not ask for a folder if the project has no starter', async () => {
            const mocks = setup({ info: async () => ({ ...project, starterReady: false }) });
            await mocks.handler.open(openUri(PROJECT_ID));

            expect(mocks.errors).to.deep.equal(['Project \'Warm up\' has no starter files to download yet']);
            expect(mocks.folderDialogs).to.equal(0);
            expect(mocks.downloads).to.have.length(0);
            expect(mocks.progress.cancelled).to.equal(1);
            expect(mocks.reports[0]).to.include({ outcome: 'no-starter', stage: 'info' });
        });

        it('should stop if no folder is selected', async () => {
            const mocks = setup({ folder: undefined });
            await mocks.handler.open(openUri(PROJECT_ID));

            expect(mocks.downloads).to.have.length(0);
            expect(mocks.errors).to.have.length(0);
            expect(mocks.progress.cancelled).to.equal(1);
            expect(mocks.reports[0]).to.include({ outcome: 'cancelled', stage: 'location' });
        });

        it('should show why the download failed', async () => {
            const mocks = setup({ download: async () => ({ ok: false, reason: 'the registry answered 404: No starter is available for this project.' }) });
            await mocks.handler.open(openUri(PROJECT_ID));

            expect(mocks.errors).to.deep.equal(['Download failed: the registry answered 404: No starter is available for this project.']);
            expect(mocks.opened).to.have.length(0);
            expect(mocks.progress.cancelled).to.equal(1);
            expect(mocks.reports[0]).to.include({ outcome: 'download-failed', stage: 'download' });
        });

        it('should close the progress if the download throws', async () => {
            const mocks = setup({ download: async () => { throw new Error('connection lost'); } });
            await mocks.handler.open(openUri(PROJECT_ID));

            expect(mocks.progress.messages[mocks.progress.messages.length - 1]).to.equal('Downloading...');
            expect(mocks.progress.cancelled).to.equal(1);
            expect(mocks.errors).to.deep.equal(['Could not open project: connection lost']);
            expect(mocks.opened).to.have.length(0);
            expect(mocks.reports).to.have.length(1);
            expect(mocks.reports[0]).to.include({ outcome: 'error', stage: 'download' });
        });

        it('should close the progress if getting the project info throws', async () => {
            const mocks = setup({ info: async () => { throw new Error('backend unavailable'); } });
            await mocks.handler.open(openUri(PROJECT_ID));

            expect(mocks.progress.cancelled).to.equal(1);
            expect(mocks.errors).to.deep.equal(['Could not open project: backend unavailable']);
            expect(mocks.reports[0]).to.include({ outcome: 'error', stage: 'info' });
        });
    });
});
