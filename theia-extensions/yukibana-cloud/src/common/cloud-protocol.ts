/**
 * SPDX-License-Identifier: MIT
 */
import { Accepted, Project } from '@yukibana/cli';

export const cloudAuthPath = '/services/yukibana/cloud-auth';
export const authClientPath = '/services/yukibana/auth-client';
export const cloudServicePath = '/services/yukibana/cloud';
export const CloudAuth = Symbol('CloudAuth');
export const AuthClient = Symbol('AuthClient');
export const CloudService = Symbol('CloudService');

export interface CloudAuth {
    login(): Promise<LoginResult>
    logout(): Promise<void>
    isLoggedIn(): Promise<boolean>
    onLoginChanged(listener: (loggedIn: boolean) => void): void
}

export interface AuthClient {
    openLoginUrl(url: string): void;
}

export type LoginResult = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly reason: string;
};

export interface CloudService {
    submit(projectId: string, archivePath: string): Promise<SubmissionResult>
    getProjectInfo(projectId: string): Promise<Project | undefined>
    downloadProject(projectId: string, destinationURI: string): Promise<boolean>
}

export type SubmissionResult = (
    { readonly ok: true } & Accepted
) | {
    readonly ok: false,
    readonly reason: string
};
