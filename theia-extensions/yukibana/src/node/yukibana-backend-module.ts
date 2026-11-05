/**
 * SPDX-License-Identifier: MIT
 */
import { bindContributionProvider } from '@theia/core';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { ContainerModule } from '@theia/core/shared/inversify';
import { LiveTelemetrySink } from '../common/yukibana-telemetry';
import { YukibanaDefaultIdentityProvider } from '../node/yukibana-default-identity-provider';
import { IdentityProviderContribution, IdentityService } from './identity-service';
import { LIVE_PATH, LiveTelemetryReporterImpl } from './live-telemetry-reporter';

export const liveTelemetryConnectionContainerModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
    bindContributionProvider(bind, LiveTelemetrySink);
    bind(LiveTelemetryReporterImpl).toSelf().inSingletonScope();
    bindBackendService(LIVE_PATH, LiveTelemetryReporterImpl);
});

export default new ContainerModule(bind => {
    bindContributionProvider(bind, IdentityProviderContribution);
    bind(YukibanaDefaultIdentityProvider).toSelf().inSingletonScope();
    bind(IdentityProviderContribution).toService(YukibanaDefaultIdentityProvider);

    bind(IdentityService).toSelf().inSingletonScope();

    bind(ConnectionContainerModule).toConstantValue(liveTelemetryConnectionContainerModule);
});
