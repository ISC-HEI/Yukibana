/**
 * SPDX-License-Identifier: MIT
 */
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { ContainerModule } from '@theia/core/shared/inversify';
import { AuthClient, cloudAuthPath, CloudService, cloudServicePath } from '../common/cloud-protocol';
import { CloudAuthImpl } from './cloud-auth';
import { CloudClient } from './cloud-client';
import { CloudServiceImpl } from './cloud-service';
import { CloudSessionManager } from './cloud-session-manager';

export default new ContainerModule(bind => {
    bind(CloudSessionManager).toSelf().inSingletonScope();

    bind(CloudAuthImpl).toSelf().inTransientScope();
    bind(ConnectionHandler).toDynamicValue(
        ctx => new RpcConnectionHandler<AuthClient>(cloudAuthPath, client => {
            const server = ctx.container.get(CloudAuthImpl);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();

    bind(CloudServiceImpl).toSelf().inSingletonScope();
    bind(CloudService).toService(CloudServiceImpl);
    bind(ConnectionHandler).toDynamicValue(
        ctx => new RpcConnectionHandler(cloudServicePath, () => ctx.container.get(CloudService))
    ).inSingletonScope();

    bind(CloudClient).toSelf().inSingletonScope();
});
