/**
 * SPDX-License-Identifier: MIT
 */
import { Command, CommandContribution, CommandRegistry, MessageService, nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { CloudAuth } from '../common/cloud-protocol';

export const LoginCommand: Command = Command.toLocalizedCommand({
    id: 'yukibana.cloudLogin',
    label: 'Log in to cloud registry',
}, 'yukibana/cloud/login');

export const LogoutCommand: Command = Command.toLocalizedCommand({
    id: 'yukibana.cloudLogout',
    label: 'Log out of cloud registry',
}, 'yukibana/cloud/logout');

@injectable()
export class LoginCommandContribution implements CommandContribution {
    @inject(CloudAuth) protected readonly auth!: CloudAuth;
    @inject(MessageService) protected readonly messageService!: MessageService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(LoginCommand, {
            execute: async () => {
                if (await this.auth.isLoggedIn()) {
                    this.messageService.info(nls.localize('yukibana/cloud/alreadyLoggedIn', 'Already logged in'));
                    return;
                }
                const progress = await this.messageService.showProgress({ text: nls.localize('yukibana/cloud/loggingIn', 'Logging in...') });
                const result = await this.auth.login();
                progress.cancel();
                if (result.ok) {
                    this.messageService.info(nls.localize('yukibana/cloud/loginSuccessful', 'Logged in successfully'));
                } else {
                    this.messageService.error(nls.localize('yukibana/cloud/loginFailed', 'Failed to log in: {0}', result.reason));
                }
            },
        });
        commands.registerCommand(LogoutCommand, {
            execute: async () => {
                await this.auth.logout();
                this.messageService.info(nls.localize('yukibana/cloud/logoutSuccessful', 'Logged out successfully'));
            },
        });
    }
}
