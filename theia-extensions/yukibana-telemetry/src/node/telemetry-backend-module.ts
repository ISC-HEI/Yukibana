/**
 * SPDX-License-Identifier: MIT
 */
import { ContainerModule } from '@theia/core/shared/inversify';
import { TelemetrySink } from '@theia/telemetry/lib/node';
import { LiveTelemetrySink } from 'yukibana-ext/lib/common/yukibana-telemetry';
import { YukibanaLiveWebsocketTelemetrySink } from './yukibana-live-ws-sink';
import { YukibanaTelemetrySink } from './yukibana-telemetry-sink';

export default new ContainerModule(bind => {
    bind(YukibanaTelemetrySink).toSelf().inSingletonScope();
    bind(TelemetrySink).toService(YukibanaTelemetrySink);

    bind(YukibanaLiveWebsocketTelemetrySink).toSelf().inSingletonScope();
    bind(LiveTelemetrySink).toService(YukibanaLiveWebsocketTelemetrySink);
});
