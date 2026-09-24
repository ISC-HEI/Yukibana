/**
 * SPDX-License-Identifier: MIT
 */
import { URI } from '@theia/core';
import { UserStorageUri } from '@theia/userstorage/lib/browser';
import { YukibanaConfig } from '../../common/yukibana-config';

export const UserConfigURI = Symbol('UserConfigURI');
export const USER_CONFIG_URI = new URI().withScheme(UserStorageUri.scheme).withPath('/user/yukibana_config.json');
export const DEFAULT_YUKIBANA_CONFIG: YukibanaConfig = {
    features: {
        codeSuggestions: true,
        squiggles: true,
    },
    layout: {
        widgets: {
            files: true,
            search: true,
            vcs: true,
            debug: true,
            testing: true,
            outline: true,
        },
        containers: {},
        views: {},
    }
};
