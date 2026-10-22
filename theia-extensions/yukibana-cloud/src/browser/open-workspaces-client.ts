/**
 * SPDX-License-Identifier: MIT
 */
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { RpcProxy } from '@theia/core/lib/common/messaging/proxy-factory';
import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { OpenWorkspacesClient, OpenWorkspacesServer } from '../common/open-workspaces-protocol';

/** Window end of `OpenWorkspacesServer`, which raises the window through `WindowService`. */
@injectable()
export class OpenWorkspacesClientImpl implements OpenWorkspacesClient {
    /** Window this frontend runs in. */
    @inject(WindowService) protected readonly windows!: WindowService;

    async focus(): Promise<void> {
        // A page cannot raise its own browser tab; the welcome screen only asks in Electron
        this.windows.focus();
    }
}

/** Contribution keeping the backend told which workspace this window has. */
@injectable()
export class OpenWorkspacesContribution implements FrontendApplicationContribution {
    /** Backend's registry of open workspaces. */
    @inject(OpenWorkspacesServer) protected readonly server!: RpcProxy<OpenWorkspacesServer>;
    /** Window's workspace. */
    @inject(WorkspaceService) protected readonly workspaces!: WorkspaceService;

    /**
     * Tells the backend this window's workspace now, after every reconnection, which starts a fresh
     * server, and whenever the workspace changes without a reload, as Save Workspace As does.
     */
    onStart(): void {
        this.server.onDidOpenConnection(() => this.announce());
        this.workspaces.onWorkspaceLocationChanged(() => this.announce());
        // The connection may have opened already; saying the same workspace twice is harmless
        this.announce();
    }

    /** Tells the backend this window's workspace, once known; a failure is only logged. */
    protected async announce(): Promise<void> {
        try {
            await this.workspaces.ready;
            await this.server.setWorkspace(this.workspaces.workspace?.resource.toString());
        } catch (e) {
            // Other windows then cannot see this one, which only costs them a second window on its project
            console.warn('Could not tell the backend which workspace this window has', e);
        }
    }
}
