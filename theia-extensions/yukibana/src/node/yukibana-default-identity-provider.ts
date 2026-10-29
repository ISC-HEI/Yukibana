/**
 * SPDX-License-Identifier: MIT
 */
import { injectable } from '@theia/core/shared/inversify';
import { randomUUIDv7 } from 'node:crypto';
import { IdentityProviderContribution } from './identity-service';

@injectable()
export class YukibanaDefaultIdentityProvider implements IdentityProviderContribution {
    readonly ID: string = 'default';
    readonly PRIORITY: number = 0;

    protected readonly id: string = randomUUIDv7();

    getIdentity(): string {
        return this.id;
    }
}
