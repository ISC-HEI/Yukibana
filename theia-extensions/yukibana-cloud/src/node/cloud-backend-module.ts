/**
 * SPDX-License-Identifier: MIT
 */
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { ContainerModule } from '@theia/core/shared/inversify';
import { AuthClient, cloudAuthPath } from '../common/cloud-protocol';
import { CloudAuthImpl } from './cloud-auth';
import { CloudService } from './cloud-service';

export default new ContainerModule(bind => {
    bind(CloudService).toSelf().inSingletonScope();

    bind(CloudAuthImpl).toSelf().inTransientScope();
    bind(ConnectionHandler).toDynamicValue(
        ctx => new RpcConnectionHandler<AuthClient>(cloudAuthPath, client => {
            const server = ctx.container.get(CloudAuthImpl);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();
});
