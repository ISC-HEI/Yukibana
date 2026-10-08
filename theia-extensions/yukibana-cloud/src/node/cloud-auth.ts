/**
 * SPDX-License-Identifier: MIT
 */
import { inject } from '@theia/core/shared/inversify';
import { AuthClient, CloudAuth, LoginResult } from '../common/cloud-protocol';
import { CloudService } from './cloud-service';

export class CloudAuthImpl implements CloudAuth {
    @inject(CloudService) protected readonly service!: CloudService;
    private client?: AuthClient;

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
