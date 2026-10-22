/**
 * SPDX-License-Identifier: MIT
 */
import { Command, CommandRegistry, MenuModelRegistry } from '@theia/core';
import { AbstractViewContribution, CommonMenus, FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { WelcomeWidget } from './welcome-widget';

/** Command that opens the welcome screen, also in Help > Welcome. */
export const WelcomeCommand: Command = Command.toLocalizedCommand({
    id: 'yukibana.welcome',
    label: 'Welcome',
}, 'yukibana/cloud/welcome/title');

/** Contribution opening the welcome screen in a window without a project, and from Help > Welcome in any window. */
@injectable()
export class WelcomeContribution extends AbstractViewContribution<WelcomeWidget> implements FrontendApplicationContribution {
    /** Window's workspace, which decides whether the screen opens at start. */
    @inject(WorkspaceService) protected readonly workspaces!: WorkspaceService;

    /** Creates a contribution whose view opens in the main area. */
    constructor() {
        super({
            widgetId: WelcomeWidget.ID,
            widgetName: WelcomeWidget.LABEL,
            defaultWidgetOptions: { area: 'main' },
        });
    }

    /** Collapses the side panels and opens the welcome screen iff the window has no workspace. */
    async onDidInitializeLayout(app: FrontendApplication): Promise<void> {
        await this.workspaces.ready;
        if (this.workspaces.opened) {
            return;
        }
        // Without a project the side panels only say there is nothing to show; the welcome screen says what to do
        await Promise.all([this.shell.collapsePanel('left'), this.shell.collapsePanel('right'), this.shell.collapsePanel('bottom')]);
        await this.openView({ activate: true, reveal: true });
    }

    /** Registers `WelcomeCommand`, which opens and activates the screen. */
    override registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(WelcomeCommand, {
            execute: () => this.openView({ activate: true, reveal: true }),
        });
    }

    /** Adds `WelcomeCommand` to the Help menu. */
    override registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.HELP, {
            commandId: WelcomeCommand.id,
            label: WelcomeCommand.label,
            order: 'a10',
        });
    }
}
