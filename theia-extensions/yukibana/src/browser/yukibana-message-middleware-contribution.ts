/**
 * SPDX-License-Identifier: MIT
 */
import { MaybePromise, MessageType } from '@theia/core';
import { YukibanaMessageMiddlewareContribution } from './yukibana-message-service';

export class DefaultMessageMiddlewareContribution implements YukibanaMessageMiddlewareContribution {
    readonly PRIORITY: number = 0;

    // oxlint-disable-next-line typescript/no-explicit-any
    shouldIgnoreMessage(type: MessageType, text: string, args?: any[]): MaybePromise<boolean> {
        if (/metals might not work correctly/i.test(text)) {
            return true;
        }
        if (/multiple problems detected in your build/i.test(text)) {
            return true;
        }
        return false;
    }

    // oxlint-disable-next-line typescript/no-explicit-any
    shouldAutoAction(type: MessageType, text: string, args?: any[]): MaybePromise<string | undefined> {
        if (/new sbt workspace detected, would you like to import the build\?/i.test(text) && args !== undefined && args.length >= 1) {
            return args[0] as string; // 'Import build'
        }
        return;
    }
}
