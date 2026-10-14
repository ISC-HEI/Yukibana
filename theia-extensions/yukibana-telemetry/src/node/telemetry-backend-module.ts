/**
 * SPDX-License-Identifier: MIT
 */
import { ContainerModule } from '@theia/core/shared/inversify';
import { TelemetrySink } from '@theia/telemetry/lib/node';
import { YukibanaTelemetrySink } from './yukibana-telemetry-sink';

export default new ContainerModule(bind => {
    bind(YukibanaTelemetrySink).toSelf().inSingletonScope();
    bind(TelemetrySink).toService(YukibanaTelemetrySink);
});
