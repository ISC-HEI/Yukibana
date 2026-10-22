/**
 * SPDX-License-Identifier: MIT
 */
import { Command, CommandContribution, CommandRegistry, MessageService, nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { localizeMarkdown } from 'yukibana-ext/lib/common/localize-markdown';
import { CloudAccount, CloudAuth, LoginResult } from '../common/cloud-protocol';
import { CloudAccountService } from './cloud-account-service';
import { AuthClientImpl } from './cloud-auth-client';

export const LoginCommand: Command = Command.toLocalizedCommand({
    id: 'yukibana.cloudLogin',
    label: 'Log in to cloud registry',
}, 'yukibana/cloud/login');

export const LogoutCommand: Command = Command.toLocalizedCommand({
    id: 'yukibana.cloudLogout',
    label: 'Log out of cloud registry',
}, 'yukibana/cloud/logout');

export const SwitchAccountCommand: Command = Command.toLocalizedCommand({
    id: 'yukibana.cloudSwitchAccount',
    label: 'Switch cloud registry account',
}, 'yukibana/cloud/switchAccount');

@injectable()
export class LoginCommandContribution implements CommandContribution {
    @inject(CloudAuth) protected readonly auth!: CloudAuth;
    @inject(MessageService) protected readonly messageService!: MessageService;
    @inject(CloudAccountService) protected readonly accounts!: CloudAccountService;
    @inject(AuthClientImpl) protected readonly authClient!: AuthClientImpl;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(LoginCommand, {
            execute: async () => {
                // Asks the registry rather than the keystore, which may hold a session the registry no longer accepts
                const state = await this.accounts.refresh();
                if (state.kind === 'logged-in') {
                    this.messageService.info(localizeMarkdown('yukibana/cloud/alreadyLoggedInAs', 'Already logged in as {0}', CloudAccount.label(state.account)));
                    return;
                }
                await this.login(() => this.auth.login());
            },
        });
        commands.registerCommand(SwitchAccountCommand, {
            execute: () => this.login(() => this.auth.switchAccount()),
        });
        commands.registerCommand(LogoutCommand, {
            execute: async () => {
                await this.auth.logout();
                this.messageService.info(nls.localize('yukibana/cloud/logoutSuccessful', 'Logged out successfully'));
            },
        });
    }

    private async login(logIn: () => Promise<LoginResult>): Promise<void> {
        const progress = await this.messageService.showProgress({ text: nls.localize('yukibana/cloud/loggingIn', 'Logging in...') });
        const showCode = this.authClient.onLoginCode(code => progress.report({
            message: localizeMarkdown('yukibana/cloud/loginCode', 'Continue in your browser; the page there shows the code {0}', code),
        }));
        try {
            const result = await logIn();
            if (!result.ok) {
                this.messageService.error(localizeMarkdown('yukibana/cloud/loginFailed', 'Failed to log in: {0}', result.reason));
                return;
            }
            const state = await this.accounts.refresh();
            this.messageService.info(state.kind === 'logged-in'
                ? localizeMarkdown('yukibana/cloud/loginSuccessfulAs', 'Logged in as {0}', CloudAccount.label(state.account))
                : nls.localize('yukibana/cloud/loginSuccessful', 'Logged in successfully'));
        } finally {
            showCode.dispose();
            progress.cancel();
        }
    }
}
