/**
 * SPDX-License-Identifier: MIT
 */
import { CommandService, ILogger, MaybePromise, URI } from '@theia/core';
import { OpenerOptions, OpenHandler } from '@theia/core/lib/browser';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { CloudAccountService } from './cloud-account-service';
import { LoginCommand } from './command-contribution';
import { YukibanaProjectOpener } from './yukibana-project-opener';

@injectable()
export class YukibanaOpenHandler implements OpenHandler {
    readonly id = 'yukibana';
    readonly label = 'Yukibana';

    static readonly PRIORITY: number = 500;

    @inject(ILogger) @named('yukibana:OpenHandler') protected readonly logger!: ILogger;
    @inject(CloudAccountService) protected readonly accounts!: CloudAccountService;
    @inject(CommandService) protected readonly commands!: CommandService;
    @inject(YukibanaProjectOpener) protected opener!: YukibanaProjectOpener;

    canHandle(uri: URI, options?: OpenerOptions): MaybePromise<number> {
        return uri.scheme === 'yukibana' ? YukibanaOpenHandler.PRIORITY : 0;
    }

    async open(uri: URI, options?: OpenerOptions): Promise<undefined> {
        const subject = uri.authority;
        const command = uri.path.toString();

        this.logger.info(`Opening url: ${uri.toString()}`);

        if (subject === 'project') {
            this.logger.info(`Running project command: ${command}`);
            await this.doProjectCommand(command, uri);
        }
    }

    protected async doProjectCommand(command: string, uri: URI): Promise<void> {
        // The registry, not the keystore, says whether the stored session still works
        if ((await this.accounts.refresh()).kind === 'logged-out') {
            this.logger.info('Logged out');
            await this.commands.executeCommand(LoginCommand.id);
        }

        if (command === '/open') {
            await this.opener.openProjectURI(uri);
        }
    }
}
