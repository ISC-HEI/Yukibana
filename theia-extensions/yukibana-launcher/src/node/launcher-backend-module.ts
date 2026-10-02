/********************************************************************************
 * Copyright (C) 2022-2024 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { ContainerModule } from '@theia/core/shared/inversify';
import { YukibanaDesktopFileServiceEndpoint } from './desktopfile-endpoint';
import { YukibanaLauncherServiceEndpoint } from './launcher-endpoint';

export default new ContainerModule(bind => {
    bind(YukibanaLauncherServiceEndpoint).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(YukibanaLauncherServiceEndpoint);

    bind(YukibanaDesktopFileServiceEndpoint).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(YukibanaDesktopFileServiceEndpoint);
});
