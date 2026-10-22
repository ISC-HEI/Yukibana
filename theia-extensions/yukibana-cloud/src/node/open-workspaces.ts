/**
 * SPDX-License-Identifier: MIT
 */
import { Disposable } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { OpenWorkspacesClient, OpenWorkspacesServer } from '../common/open-workspaces-protocol';

/** Workspace of every connected window that has one, shared by the windows' connections. */
@injectable()
export class OpenWorkspaces {
    /** Workspace URI of each window that has one, by the window's connection. */
    readonly windows = new Map<OpenWorkspacesServerImpl, string>();
}

/**
 * One window's end of `OpenWorkspacesServer`, made per connection; it forgets the window's
 * workspace when disposed with the connection.
 */
@injectable()
export class OpenWorkspacesServerImpl implements OpenWorkspacesServer, Disposable {
    /** Workspaces of all windows. */
    @inject(OpenWorkspaces) protected readonly open!: OpenWorkspaces;

    /** Window this connection reaches, until the connection closes. */
    protected client?: OpenWorkspacesClient;

    /** Makes `client` the window this connection reaches, or none if it is undefined. */
    setClient(client: OpenWorkspacesClient | undefined): void {
        this.client = client;
    }

    async setWorkspace(uri: string | undefined): Promise<void> {
        if (uri) {
            this.open.windows.set(this, uri);
        } else {
            this.open.windows.delete(this);
        }
    }

    async list(): Promise<string[]> {
        return [...new Set(this.open.windows.values())];
    }

    async focus(uri: string): Promise<boolean> {
        const window = [...this.open.windows].find(([, open]) => open === uri)?.[0];
        if (!window?.client) {
            return false;
        }
        try {
            // A window whose connection closes meanwhile fails the call; then the project opens anew
            await window.client.focus();
            return true;
        } catch {
            return false;
        }
    }

    /** Forgets the window and its workspace. */
    dispose(): void {
        this.open.windows.delete(this);
        this.client = undefined;
    }
}
