/**
 * SPDX-License-Identifier: MIT
 */
import { Emitter } from '@theia/core';
import { inject } from '@theia/core/shared/inversify';
import { AuthClient, CloudAuth, LoginResult } from '../common/cloud-protocol';
import { CloudSessionManager } from './cloud-session-manager';

export class CloudAuthImpl implements CloudAuth {
    @inject(CloudSessionManager) protected readonly service!: CloudSessionManager;
    private client?: AuthClient;

    private readonly onLoginChangeEmitter = new Emitter<boolean>();
    readonly onLoginChanged = this.onLoginChangeEmitter.event;

    setClient(client?: AuthClient): void {
        this.client = client;
    }

    dispose(): void {
        this.client = undefined;
    }

    login(): Promise<LoginResult> {
        return this.service.login(url => this.client?.openLoginUrl(url));
    }
    logout(): Promise<void> {
        return this.service.logout();
    }
    isLoggedIn(): Promise<boolean> {
        return this.service.isLoggedIn();
    }
}
