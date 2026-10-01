/**
 * SPDX-License-Identifier: MIT
 */
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { interfaces } from '@theia/core/shared/inversify';
import { ConfigProvider } from './config-provider';

export function bindConfig(bind: interfaces.Bind): void {
    bind(ConfigProvider).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ConfigProvider);
}
