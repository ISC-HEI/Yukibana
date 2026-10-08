/**
 * SPDX-License-Identifier: MIT
 */
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { LocalizationContribution } from '@theia/core/lib/node/i18n/localization-contribution';
import { ContainerModule } from '@theia/core/shared/inversify';
import { SubmissionService, submissionServicePath } from '../common/submission-protocol';
import { YukibanaSubmissionLocalizationContribution } from './submission-localization-contribution';
import { SubmissionServiceImpl } from './submission-service';

export default new ContainerModule(bind => {
    bind(SubmissionServiceImpl).toSelf().inSingletonScope();
    bind(SubmissionService).toService(SubmissionServiceImpl);
    bind(ConnectionHandler).toDynamicValue(
        ctx => new RpcConnectionHandler(submissionServicePath, () => ctx.container.get(SubmissionService))
    ).inSingletonScope();

    bind(YukibanaSubmissionLocalizationContribution).toSelf().inSingletonScope();
    bind(LocalizationContribution).toService(YukibanaSubmissionLocalizationContribution);
});
