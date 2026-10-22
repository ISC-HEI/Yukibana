/**
 * SPDX-License-Identifier: MIT
 */

/** Path the frontend reaches the backend's `OpenWorkspacesServer` at. */
export const openWorkspacesPath = '/services/yukibana/open-workspaces';
/** Injection key of `OpenWorkspacesServer`. */
export const OpenWorkspacesServer = Symbol('OpenWorkspacesServer');

/**
 * Registry of the workspaces the IDE's windows have open, kept by the backend all windows share.
 *
 * It lets the welcome screen bring a window that already has a project to the front rather than
 * open the project a second time.
 */
export interface OpenWorkspacesServer {
    /** Records `uri`, as Theia's recent list writes it, as this window's workspace, or none if it is undefined. */
    setWorkspace(uri: string | undefined): Promise<void>;
    /** Returns the workspaces open in any window, this one included, each once. */
    list(): Promise<string[]>;
    /** Brings a window that has `uri` open to the front, and returns `true` iff there was one and it came. */
    focus(uri: string): Promise<boolean>;
}

/** Window end of `OpenWorkspacesServer`, which the backend calls back. */
export interface OpenWorkspacesClient {
    /** Brings this window to the front, settling once it has. */
    focus(): Promise<void>;
}
