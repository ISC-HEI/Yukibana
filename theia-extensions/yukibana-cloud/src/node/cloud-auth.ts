/**
 * SPDX-License-Identifier: MIT
 */
import { DisposableCollection, ILogger } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { AuthClient, CloudAccount, CloudAuth, LoginResult } from '../common/cloud-protocol';
import { CloudClient, isRefused } from './cloud-client';
import { CloudSessionManager, OpenLoginUrl } from './cloud-session-manager';

@injectable()
export class CloudAuthImpl implements CloudAuth {
    @inject(CloudSessionManager) protected readonly service!: CloudSessionManager;
    @inject(CloudClient) protected readonly cloudClient!: CloudClient;
    @inject(ILogger) @named('yukibana:CloudAuth') protected readonly logger!: ILogger;
    private client?: AuthClient;
    private readonly toDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.service.onLoginChanged(() => this.client?.notifyLoginChanged()));
    }

    setClient(client?: AuthClient): void {
        this.client = client;
    }

    dispose(): void {
        this.client = undefined;
        this.toDispose.dispose();
    }

    private readonly openLoginUrl: OpenLoginUrl = (url, code) => this.client?.openLoginUrl(url, code);

    login(): Promise<LoginResult> {
        return this.service.login(this.openLoginUrl);
    }

    switchAccount(): Promise<LoginResult> {
        return this.service.switchAccount(this.openLoginUrl);
    }

    logout(): Promise<void> {
        return this.service.logout();
    }

    async whoAmI(): Promise<CloudAccount | undefined> {
        if (!await this.service.isLoggedIn()) {
            return undefined;
        }
        try {
            return await this.cloudClient.me();
        } catch (e) {
            if (isRefused(e)) {
                // A session that can no longer be used would otherwise block logging in again
                this.logger.info(`Forgetting a session the registry no longer accepts: ${e.message}`);
                await this.service.forget();
                return undefined;
            }
            throw e;
        }
    }
}
