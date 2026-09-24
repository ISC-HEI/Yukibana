/**
 * SPDX-License-Identifier: MIT
 */
import { injectable, inject } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, MessageService } from '@theia/core/lib/common';
import { CommonMenus } from '@theia/core/lib/browser';

export const YukibanaCommand: Command = {
    id: 'Yukibana.command',
    label: 'Say Hello'
};

/**
 * Simple demo command to show a 'Hello World!' message
 */
@injectable()
export class YukibanaCommandContribution implements CommandContribution {

    @inject(MessageService)
    protected readonly messageService!: MessageService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(YukibanaCommand, {
            execute: () => this.messageService.info('Hello World!')
        });
    }
}

/**
 * Contribution to register a menu action for the 'Say Hello' command
 */
@injectable()
export class YukibanaMenuContribution implements MenuContribution {

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: YukibanaCommand.id,
            label: YukibanaCommand.label
        });
    }
}
