/**
 * SPDX-License-Identifier: MIT
 */
import { URI } from '@theia/core';
import { UserStorageUri } from '@theia/userstorage/lib/browser';

export const UserConfigURI = Symbol('UserConfigURI');
export const USER_CONFIG_URI = new URI().withScheme(UserStorageUri.scheme).withPath('/user/yukibana_config.json');

