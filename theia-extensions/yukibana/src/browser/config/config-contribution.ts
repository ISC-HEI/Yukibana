/**
 * SPDX-License-Identifier: MIT
 */
import { interfaces } from '@theia/core/shared/inversify';
import { USER_CONFIG_URI, UserConfigURI } from './config-constants';
import { ConfigStorageProvider } from './config-storage-provider';

export function bindConfig(bind: interfaces.Bind): void {
    bind(UserConfigURI).toConstantValue(USER_CONFIG_URI);
    bind(ConfigStorageProvider).toSelf().inSingletonScope();
}
