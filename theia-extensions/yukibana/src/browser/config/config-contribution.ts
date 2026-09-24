/**
 * SPDX-License-Identifier: MIT
 */
import { interfaces } from '@theia/core/shared/inversify';
import { USER_CONFIG_URI, UserConfigURI } from './config-constants';
import { ConfigProvider } from './config-provider';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';

export function bindConfig(bind: interfaces.Bind): void {
    bind(UserConfigURI).toConstantValue(USER_CONFIG_URI);
    bind(ConfigProvider).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ConfigProvider);
}
