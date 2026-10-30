/**
 * SPDX-License-Identifier: MIT
 */
import { bindContributionProvider } from '@theia/core';
import { ContainerModule } from '@theia/core/shared/inversify';
import { YukibanaDefaultIdentityProvider } from '../node/yukibana-default-identity-provider';
import { IdentityProviderContribution, IdentityService } from './identity-service';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bindContributionProvider(bind, IdentityProviderContribution);
    bind(YukibanaDefaultIdentityProvider).toSelf().inSingletonScope();
    bind(IdentityProviderContribution).toService(YukibanaDefaultIdentityProvider);

    bind(IdentityService).toSelf().inSingletonScope();
});
