/********************************************************************************
 * Copyright (C) 2022-2024 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandContribution } from '@theia/core/lib/common';
import { ContainerModule } from '@theia/core/shared/inversify';
import { CreateLauncherCommandContribution } from './create-launcher-contribution';
import { DesktopFileService } from './desktopfile-service';
import { LauncherService } from './launcher-service';

export default new ContainerModule(bind => {
    bind(CreateLauncherCommandContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(CreateLauncherCommandContribution);
    bind(CommandContribution).toService(CreateLauncherCommandContribution);
    bind(LauncherService).toSelf().inSingletonScope();
    bind(DesktopFileService).toSelf().inSingletonScope();
});
