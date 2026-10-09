/**
 * SPDX-License-Identifier: MIT
 */
import '../../src/browser/style/index.css';

import { bindContributionProvider, CommandContribution } from '@theia/core';
import { ServiceConnectionProvider } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import { SubmissionService, submissionServicePath } from '../common/submission-protocol';
import { SubmissionTarget } from '../common/submission-target';
import { SubmitCommandContribution } from './submission-frontend-contribution';

export default new ContainerModule(bind => {
    bind(CommandContribution).to(SubmitCommandContribution);
    bind(SubmissionService).toDynamicValue(
        ctx => ServiceConnectionProvider.createProxy<SubmissionService>(ctx.container, submissionServicePath)
    ).inSingletonScope();

    bindContributionProvider(bind, SubmissionTarget);
});
