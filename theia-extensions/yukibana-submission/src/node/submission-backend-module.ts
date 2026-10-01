/**
 * SPDX-License-Identifier: MIT
 */
import { ContainerModule } from '@theia/core/shared/inversify';
import { SubmissionServiceImpl } from './submission-service';
import { SubmissionService, submissionServicePath } from './submission-protocol';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';

export default new ContainerModule(bind => {
    bind(SubmissionServiceImpl).toSelf().inSingletonScope();
    bind(SubmissionService).toService(SubmissionServiceImpl);
    bind(ConnectionHandler).toDynamicValue(
        ctx => new RpcConnectionHandler(submissionServicePath, () => ctx.container.get(SubmissionService))
    ).inSingletonScope();
});
