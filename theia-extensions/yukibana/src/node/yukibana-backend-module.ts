/**
 * SPDX-License-Identifier: MIT
 */
import { bindContributionProvider } from '@theia/core';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { ContainerModule } from '@theia/core/shared/inversify';
import { LiveTelemetryClient, LiveTelemetryService, LiveTelemetryServicePath } from '../common/yukibana-telemetry';
import { YukibanaDefaultIdentityProvider } from '../node/yukibana-default-identity-provider';
import { IdentityProviderContribution, IdentityService } from './identity-service';
import { LiveTelemetryServiceImpl } from './live-telemetry-service';
import { LiveTelemetrySinkContribution } from './live-telemetry-sink-contribution';

export const liveTelemetryConnectionContainerModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
    bindContributionProvider(bind, LiveTelemetrySinkContribution);
    bind(LiveTelemetryServiceImpl).toSelf().inSingletonScope();
    bind(LiveTelemetryService).toService(LiveTelemetryServiceImpl);
    bindBackendService<LiveTelemetryService, LiveTelemetryClient>(LiveTelemetryServicePath, LiveTelemetryService, (service, client) => {
        service.setClient(client);
        client.onDidCloseConnection(() => service.dispose());
        return service;
    });
});

export default new ContainerModule(bind => {
    bindContributionProvider(bind, IdentityProviderContribution);
    bind(YukibanaDefaultIdentityProvider).toSelf().inSingletonScope();
    bind(IdentityProviderContribution).toService(YukibanaDefaultIdentityProvider);

    bind(IdentityService).toSelf().inSingletonScope();

    bind(ConnectionContainerModule).toConstantValue(liveTelemetryConnectionContainerModule);
});
