/**
 * SPDX-License-Identifier: MIT
 */
import { URI } from '@theia/core';
import { Accepted, Me, Project } from '@yukibana/cli';

export const cloudAuthPath = '/services/yukibana/cloud-auth';
export const authClientPath = '/services/yukibana/auth-client';
export const cloudServicePath = '/services/yukibana/cloud';
export const CloudAuth = Symbol('CloudAuth');
export const AuthClient = Symbol('AuthClient');
export const CloudService = Symbol('CloudService');

export interface CloudAuth {
    login(): Promise<LoginResult>
    /** Logs in again, ending the current session only once the new one is there. */
    switchAccount(): Promise<LoginResult>
    logout(): Promise<void>
    /** The account the registry knows the session as, or undefined when nobody is logged in. */
    whoAmI(): Promise<CloudAccount | undefined>
}

export interface AuthClient {
    /** `code` is what the login page shows too, so the person can tell it is this login. */
    openLoginUrl(url: string, code?: string): void;
    /** Someone logged in or out, possibly from another window. */
    notifyLoginChanged(): void;
}

export type CloudAccount = Me;

export namespace CloudAccount {
    /** What tells the account apart from any other, for messages: the email when there is one. */
    export function label(account: CloudAccount): string {
        return account.email ?? account.githubLogin ?? account.fullName ?? account.userId;
    }

    /** What the person is called, for the status bar: the display name when there is one. */
    export function displayName(account: CloudAccount): string {
        return account.fullName ?? label(account);
    }
}

export type LoginResult = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly reason: string;
};

export type SubmissionResult = (
    { readonly ok: true } & Accepted
) | {
    readonly ok: false,
    readonly reason: string
};

export type DownloadResult = {
    readonly ok: true;
    readonly uri: URI;
} | {
    readonly ok: false;
    readonly reason: string;
};

export enum CanSubmitStatus {
    NOT_ALLOWED,
    NOT_OPEN,
    OPEN,
    LATE,
    CLOSED,
    UNKNOWN
}

/** A project, or why there is none: the registry answers 404 both for no such project and for one the caller may not see. */
export type ProjectLookup =
    | { readonly kind: 'found', readonly project: Project }
    | { readonly kind: 'not-found' }
    | { readonly kind: 'not-logged-in' };

/**
 * Projects the person can see, or why there are none to show.
 *
 * A student sees the published projects of their editions, staff all of their editions'; the registry decides which.
 */
export type ProjectListing =
    | { readonly kind: 'found', readonly projects: readonly Project[] }
    | { readonly kind: 'not-logged-in' }
    | { readonly kind: 'error', readonly reason: string };

/** Whether the caller may submit, with the project it was decided from when the registry answered. */
export interface SubmitAvailability {
    readonly status: CanSubmitStatus;
    readonly project?: Project;
}

export interface CloudService {
    submit(projectId: string, archivePath: string): Promise<SubmissionResult>
    getProjectInfo(projectId: string): Promise<ProjectLookup>
    /** Returns the projects the logged-in person can see; a failure other than being logged out is an `error`. */
    listProjects(): Promise<ProjectListing>
    /**
     * Downloads the starter of `projectId` into a new folder inside `destinationURI`, and returns that folder or why it failed.
     *
     * The folder takes the starter's own folder name, or `folderName` if the starter is loose files,
     * with `-2`, `-3`... added if the name is taken; nothing that exists is written to.
     */
    downloadProject(projectId: string, destinationURI: string, folderName: string): Promise<DownloadResult>
    canSubmitProject(projectId: string): Promise<SubmitAvailability>
}
