/**
 * SPDX-License-Identifier: MIT
 */
import { ContainerModule } from '@theia/core/shared/inversify';
import { PrepareSubmissionContribution } from './submission-frontend-contribution';
import { CommandContribution } from '@theia/core';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(CommandContribution).to(PrepareSubmissionContribution);
});
