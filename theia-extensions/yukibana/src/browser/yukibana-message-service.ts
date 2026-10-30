/**
 * SPDX-License-Identifier: MIT
 */
import { ContributionProvider, ILogger, MaybePromise, MessageService, MessageType } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';

export const YukibanaMessageMiddlewareContribution = Symbol('YukibanaMessageMiddlewareContribution');
export interface YukibanaMessageMiddlewareContribution {
    readonly PRIORITY: number;
    // oxlint-disable-next-line typescript/no-explicit-any
    shouldIgnoreMessage(type: MessageType, text: string, args?: any[]): MaybePromise<boolean>;
    // oxlint-disable-next-line typescript/no-explicit-any
    shouldAutoAction(type: MessageType, text: string, args?: any[]): MaybePromise<string | undefined>;
}

@injectable()
export class YukibanaMessageService extends MessageService {
    @inject(ILogger) @named('yukibana:MessageService') protected readonly logger!: ILogger;
    @inject(ContributionProvider) @named(YukibanaMessageMiddlewareContribution) protected readonly middlewareProvider!: ContributionProvider<YukibanaMessageMiddlewareContribution>;

    protected getMiddelwares(): YukibanaMessageMiddlewareContribution[] {
        const middlewares = this.middlewareProvider.getContributions();
        return middlewares.sort((a, b) => b.PRIORITY - a.PRIORITY);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected async processMessage(type: MessageType, text: string, args?: any[]): Promise<string | undefined> {
        const middlewares = this.getMiddelwares();
        const typeName = MessageType[type];

        for (const middleware of middlewares) {
            if (await middleware.shouldIgnoreMessage(type, text, args)) {
                this.logger.debug(`Ignoring message of type ${typeName} (args = ${!!args ? JSON.stringify(args) : args}): '${text}'`);
                return;
            }
        }

        for (const middleware of middlewares) {
            const autoAction = middleware.shouldAutoAction(type, text, args);
            if (autoAction !== undefined) {
                this.logger.debug(`Auto selecting action '${autoAction}' for message of type ${typeName} (args = ${!!args ? JSON.stringify(args) : args}): '${text}'`);
                return autoAction;
            }
        }

        return super.processMessage(type, text, args);
    }
}
