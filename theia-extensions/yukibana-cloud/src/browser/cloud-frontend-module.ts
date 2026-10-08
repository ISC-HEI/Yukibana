/**
 * SPDX-License-Identifier: MIT
 */
import { ServiceConnectionProvider } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import { CloudService, cloudServicePath } from '../common/cloud-protocol';

export default new ContainerModule(bind => {
    bind(CloudService).toDynamicValue(
        ctx => ServiceConnectionProvider.createProxy<CloudService>(ctx.container, cloudServicePath)
    ).inSingletonScope();
});
