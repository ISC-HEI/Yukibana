/**
 * SPDX-License-Identifier: MIT
 */
import { ContainerModule } from '@theia/core/shared/inversify';
import { YukibanaMessageMiddlewareContribution } from 'yukibana-ext/lib/browser/yukibana-message-service';
import { ScalaMessageMiddlewareContribution } from './message-middleware-contribution';

export default new ContainerModule(bind => {
    bind(ScalaMessageMiddlewareContribution).toSelf().inSingletonScope();
    bind(YukibanaMessageMiddlewareContribution).toService(ScalaMessageMiddlewareContribution);
});
