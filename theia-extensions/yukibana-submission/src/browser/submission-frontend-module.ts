/**
 * SPDX-License-Identifier: MIT
 */
import '../../src/browser/style/index.css';

import { CommandContribution } from '@theia/core';
import { ServiceConnectionProvider } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import { SubmissionService, submissionServicePath } from '../common/submission-protocol';
import { PrepareSubmissionContribution } from './submission-frontend-contribution';

export default new ContainerModule(bind => {
    bind(CommandContribution).to(PrepareSubmissionContribution);
    bind(SubmissionService).toDynamicValue(
        ctx => ServiceConnectionProvider.createProxy<SubmissionService>(ctx.container, submissionServicePath)
    ).inSingletonScope();
});
