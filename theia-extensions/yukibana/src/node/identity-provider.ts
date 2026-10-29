/**
 * SPDX-License-Identifier: MIT
 */
import { MaybePromise } from '@theia/core';

export const IdentityProvider = Symbol('IdentityProvider');

export interface IdentityProvider {
    readonly ID: string

    getIdentity(): MaybePromise<string>
}
