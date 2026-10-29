/**
 * SPDX-License-Identifier: MIT
 */
import { ContributionProvider, MaybePromise } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { IdentityProvider } from './identity-provider';

export const IdentityProviderContribution = Symbol('IdentityProviderContribution');
export interface IdentityProviderContribution extends IdentityProvider {
    readonly PRIORITY: number;
}

@injectable()
export class IdentityService implements IdentityProvider {
    @inject(ContributionProvider) @named(IdentityProviderContribution)
    protected readonly providers!: ContributionProvider<IdentityProviderContribution>;

    protected getBestProvider(): IdentityProvider {
        const providers = this.providers.getContributions();
        return providers.sort((a, b) => b.PRIORITY - a.PRIORITY)[0];
    }

    get ID(): string {
        return this.getBestProvider().ID;
    }

    getIdentity(): MaybePromise<string> {
        return this.getBestProvider().getIdentity();
    }
}
