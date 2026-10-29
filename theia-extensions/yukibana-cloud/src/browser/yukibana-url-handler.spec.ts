/**
 * SPDX-License-Identifier: MIT
 */
// @vitest-environment jsdom
import { CommandService, ILogger, MessageService, URI } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { FileDialogService } from '@theia/filesystem/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { TelemetryService } from '@theia/telemetry/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { Project } from '@yukibana/cli';
import { expect } from 'chai';
import { describe, it } from 'vitest';
import { CloudService, DownloadResult, ProjectLookup } from '../common/cloud-protocol';
import { CloudTelemetry } from '../common/cloud-telemetry';
import { CloudAccountService } from './cloud-account-service';
import { YukibanaOpenHandler } from './yukibana-url-handler';
import { YukibanaProjectOpener } from './yukibana-project-opener';

class TestProjectOpener extends YukibanaProjectOpener {
    newWindow: boolean | undefined = false;
    logger: ILogger = new MockLogger();

    protected override async askOpenInNewWindow(): Promise<boolean | undefined> {
        return this.newWindow;
    }
}

interface Options {
    loggedIn?: boolean;
    /** Whether running the Log in command logs the person in. */
    loginWorks?: boolean;
    lookup?: () => Promise<ProjectLookup>;
    folder?: URI;
    download?: () => Promise<DownloadResult>;
    /** The action picked on an error message, if any. */
    choice?: string;
}

const PROJECT_ID = '01a11653-0353-7389-81f4-01837a3ed666';
const project = { projectId: PROJECT_ID, slug: 'warmup', title: 'Warm up', starterReady: true } as Project;
const found = (p: Project): ProjectLookup => ({ kind: 'found', project: p });
const folder = new URI('file:///home/student/projects');
const projectUri = new URI('file:///home/student/projects/warmup');

interface Mocks {
    handler: YukibanaOpenHandler;
    /** Progress messages reported, and whether the notification was closed. */
    progress: { messages: string[], cancelled: number, shown: boolean };
    errors: string[];
    warnings: string[];
    reports: CloudTelemetry.OpenProjectURIData[];
    opened: { uri: URI, preserveWindow?: boolean }[];
    folderDialogs: number;
    downloads: { projectId: string, destination: string }[];
    commands: string[];
    opener: TestProjectOpener;
}

function setup(options: Options = {}): Mocks {
    const mocks: Omit<Mocks, 'handler'> = {
        progress: { messages: [], cancelled: 0, shown: false },
        errors: [],
        warnings: [],
        reports: [],
        opened: [],
        folderDialogs: 0,
        downloads: [],
        commands: [],
        opener: new TestProjectOpener(),
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
            return options.choice;
        },
        warn: async (message: string) => {
            mocks.warnings.push(message);
            return undefined;
        },
    };
    const service: Partial<CloudService> = {
        getProjectInfo: options.lookup ?? (async () => found(project)),
        downloadProject: async (projectId, destination) => {
            mocks.downloads.push({ projectId, destination });
            return options.download ? options.download() : { ok: true, leftOut: [] };
        },
    };
    // Every folder is missing, so no conflict is ever asked about.
    const files = {
        exists: async () => false,
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
    let loggedIn = options.loggedIn ?? true;
    const accounts = {
        refresh: async () => ({ kind: loggedIn ? 'logged-in' : 'logged-out' }),
    };
    const commands = {
        executeCommand: async (id: string) => {
            mocks.commands.push(id);
            loggedIn ||= options.loginWorks ?? false;
        },
    };
    const opener = mocks.opener;
    Object.assign(opener, {
        logger: new MockLogger() as ILogger,
        service: service as CloudService,
        fileDialogs: fileDialogs as unknown as FileDialogService,
        workspaces: workspaces as unknown as WorkspaceService,
        files: files as unknown as FileService,
        messages: messages as unknown as MessageService,
        telemetry: telemetry as unknown as TelemetryService,
        accounts: accounts as unknown as CloudAccountService,
        commands: commands as unknown as CommandService,
    });

    const handler = new YukibanaOpenHandler();
    Object.assign(handler, {
        logger: new MockLogger() as ILogger,
        accounts: accounts as unknown as CloudAccountService,
        commands: commands as unknown as CommandService,
        opener: opener as unknown as YukibanaProjectOpener,
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
        it('should download the project straight into a folder named after its slug, and open it', async () => {
            const mocks = setup();
            await mocks.handler.open(openUri(PROJECT_ID));

            expect(mocks.downloads).to.deep.equal([{ projectId: PROJECT_ID, destination: projectUri.toString() }]);
            expect(mocks.opened).to.have.length(1);
            expect(mocks.opened[0].uri.toString()).to.equal(projectUri.toString());
            expect(mocks.opened[0].preserveWindow).to.equal(true);
            expect(mocks.errors).to.have.length(0);
            expect(mocks.progress.cancelled).to.equal(1);
            expect(mocks.reports).to.have.length(1);
            expect(mocks.reports[0]).to.include({ outcome: 'opened', stage: 'window', projectId: PROJECT_ID, newWindow: false });
        });

        it('should say which files of the starter were not unpacked, and still open the project', async () => {
            const mocks = setup({ download: async () => ({ ok: true, leftOut: ['link: a symlink out of the folder'] }) });
            await mocks.handler.open(openUri(PROJECT_ID));

            expect(mocks.warnings).to.deep.equal(['Some files of the starter were not unpacked: link: a symlink out of the folder']);
            expect(mocks.opened).to.have.length(1);
        });

        it('should open the project in a new window if asked to', async () => {
            const mocks = setup();
            mocks.opener.newWindow = true;
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

        it('should log in first when nobody is logged in', async () => {
            const mocks = setup({ loggedIn: false, loginWorks: true });
            await mocks.handler.open(openUri(PROJECT_ID));

            expect(mocks.commands).to.deep.equal(['yukibana.cloudLogin']);
            expect(mocks.errors).to.have.length(0);
            expect(mocks.opened).to.have.length(1);
            expect(mocks.reports.map(r => r.outcome)).to.deep.equal(['opened']);
        });

        it('should offer to log in again when that login did not work', async () => {
            const mocks = setup({ loggedIn: false, lookup: async () => ({ kind: 'not-logged-in' }) });
            await mocks.handler.open(openUri(PROJECT_ID));

            expect(mocks.commands).to.deep.equal(['yukibana.cloudLogin']);
            expect(mocks.errors).to.deep.equal(['Log in to open this project']);
            expect(mocks.folderDialogs).to.equal(0);
            expect(mocks.progress.cancelled).to.equal(1);
            expect(mocks.reports[0]).to.include({ outcome: 'not-logged-in', stage: 'info' });
        });

        it('should open the project once a session the registry refused is replaced', async () => {
            let lookups = 0;
            const mocks = setup({
                loginWorks: true,
                choice: 'Log in',
                lookup: async () => lookups++ === 0 ? { kind: 'not-logged-in' } : found(project),
            });
            await mocks.handler.open(openUri(PROJECT_ID));
            await new Promise(resolve => setTimeout(resolve));

            expect(mocks.commands).to.deep.equal(['yukibana.cloudLogin']);
            expect(lookups).to.equal(2);
            expect(mocks.opened).to.have.length(1);
            expect(mocks.reports.map(r => r.outcome)).to.deep.equal(['not-logged-in', 'opened']);
        });

        it('should not let a project title add links to the message', async () => {
            const mocks = setup({ lookup: async () => found({ ...project, title: '[Click](command:workbench.action.reloadWindow)', starterReady: false }) });
            await mocks.handler.open(openUri(PROJECT_ID));

            expect(mocks.errors[0]).to.contain('Click');
            expect(mocks.errors[0]).not.to.contain('[Click](command:');
        });

        it('should report a project that cannot be found', async () => {
            const mocks = setup({ lookup: async () => ({ kind: 'not-found' }) });
            await mocks.handler.open(openUri(PROJECT_ID));

            expect(mocks.errors).to.deep.equal(['Project not found']);
            expect(mocks.folderDialogs).to.equal(0);
            expect(mocks.progress.cancelled).to.equal(1);
            expect(mocks.reports[0]).to.include({ outcome: 'not-found', stage: 'info' });
        });

        it('should not ask for a folder if the project has no starter', async () => {
            const mocks = setup({ lookup: async () => found({ ...project, starterReady: false }) });
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
            const mocks = setup({ lookup: async () => { throw new Error('backend unavailable'); } });
            await mocks.handler.open(openUri(PROJECT_ID));

            expect(mocks.progress.cancelled).to.equal(1);
            expect(mocks.errors).to.deep.equal(['Could not open project: backend unavailable']);
            expect(mocks.reports[0]).to.include({ outcome: 'error', stage: 'info' });
        });
    });
});
