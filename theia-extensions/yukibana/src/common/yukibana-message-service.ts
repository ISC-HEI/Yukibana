/**
 * SPDX-License-Identifier: MIT
 */

import { ILogger, MessageService, MessageType } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';

@injectable()
export class YukibanaMessageService extends MessageService {
    @inject(ILogger) @named('yukibana:MessageService') protected readonly logger!: ILogger;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected async processMessage(type: MessageType, text: string, args?: any[]): Promise<string | undefined> {
        if (this.shouldIgnoreMessage(type, text, args)) {
            this.logger.debug(`Ignoring message of type ${type} (args = ${!!args ? JSON.stringify(args) : args}): '${text}'`);
            return;
        }
        const autoAction = this.shouldAutoAction(type, text, args);
        if (autoAction !== undefined) {
            this.logger.debug(`Auto selecting action '${autoAction}' for message of type ${type} (args = ${!!args ? JSON.stringify(args) : args}): '${text}'`);
            return autoAction;
        }
        return super.processMessage(type, text, args);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private shouldIgnoreMessage(type: MessageType, text: string, args?: any[]): boolean {
        if (/metals might not work correctly/i.test(text)) {
            return true;
        }
        return false;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private shouldAutoAction(type: MessageType, text: string, args?: any[]): string | undefined {
        if (/new sbt workspace detected, would you like to import the build\?/i.test(text) && args !== undefined && args.length >= 1) {
            return args[0] as string; // 'Import build'
        }
        return;
    }
}
