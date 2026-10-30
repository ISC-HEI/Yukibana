/**
 * SPDX-License-Identifier: MIT
 */
import { inject, injectable } from '@theia/core/shared/inversify';
import { randomUUIDv7 } from 'node:crypto';
import { IdentityProviderContribution } from 'yukibana-ext/lib/node/identity-service';
import { CloudAuth } from '../common/cloud-protocol';
import { CloudAuthImpl } from './cloud-auth';

@injectable()
export class CloudIdentityProvider implements IdentityProviderContribution {
    readonly ID: string = 'cloud';
    readonly PRIORITY: number = 100;

    @inject(CloudAuthImpl) protected readonly auth!: CloudAuth;

    protected readonly staticRandomId: string = randomUUIDv7();

    async getIdentity(): Promise<string> {
        const account = await this.auth.whoAmI();
        if (account === undefined) {
            return this.staticRandomId;
        }
        const name = account.fullName ?? account.githubLogin ?? account.email;
        if (!!name) {
            return `${name}/${this.staticRandomId}`;
        }
        return this.staticRandomId;
    }
}
