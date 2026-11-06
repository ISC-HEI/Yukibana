/**
 * SPDX-License-Identifier: MIT
 */
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { ContainerModule } from '@theia/core/shared/inversify';
import { TelemetrySink } from '@theia/telemetry/lib/node';
import { LiveTelemetrySinkContribution } from 'yukibana-ext/lib/node/live-telemetry-sink-contribution';
import { YukibanaLiveWebsocketTelemetrySinkContribution } from './yukibana-live-ws-sink';
import { YukibanaTelemetrySink } from './yukibana-telemetry-sink';

export const liveWebsocketTelemetryConnectionContainerModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
    bind(YukibanaLiveWebsocketTelemetrySinkContribution).toSelf().inSingletonScope();
    bind(LiveTelemetrySinkContribution).toService(YukibanaLiveWebsocketTelemetrySinkContribution);
});

export default new ContainerModule(bind => {
    bind(YukibanaTelemetrySink).toSelf().inSingletonScope();
    bind(TelemetrySink).toService(YukibanaTelemetrySink);
    bind(ConnectionContainerModule).toConstantValue(liveWebsocketTelemetryConnectionContainerModule);
});
