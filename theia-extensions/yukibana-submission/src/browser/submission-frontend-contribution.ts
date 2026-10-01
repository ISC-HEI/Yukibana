/**
 * SPDX-License-Identifier: MIT
 */
import { injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core';

export const PrepareSubmissionCommand: Command = {
    id: 'yukibana.prepareSubmission',
    label: 'Prepare submission'
};

@injectable()
export class PrepareSubmissionContribution implements CommandContribution {
    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(PrepareSubmissionCommand, {
            execute: () => { }
        });
    }
}
