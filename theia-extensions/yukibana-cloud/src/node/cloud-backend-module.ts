/**
 * SPDX-License-Identifier: MIT
 */
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { ContainerModule } from '@theia/core/shared/inversify';
import { CloudService, cloudServicePath } from '../common/cloud-protocol';
import { CloudServiceImpl } from './cloud-service';

export default new ContainerModule(bind => {
    bind(CloudServiceImpl).toSelf().inSingletonScope();
    bind(CloudService).toService(CloudServiceImpl);
    bind(ConnectionHandler).toDynamicValue(
        ctx => new RpcConnectionHandler(cloudServicePath, () => ctx.container.get(CloudService))
    ).inSingletonScope();
});
