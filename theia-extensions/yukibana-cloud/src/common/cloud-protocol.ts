/**
 * SPDX-License-Identifier: MIT
 */
export const cloudAuthPath = '/services/yukibana/cloud';
export const authClientPath = '/services/yukibana/auth-client';
export const CloudAuth = Symbol('CloudAuth');
export const AuthClient = Symbol('AuthClient');

export interface CloudAuth {
    login(): Promise<LoginResult>
    logout(): Promise<void>
    isLoggedIn(): Promise<boolean>
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
