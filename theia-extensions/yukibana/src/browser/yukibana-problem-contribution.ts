/**
 * SPDX-License-Identifier: MIT
 */
import { Command, CommandContribution, CommandRegistry, ILogger } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { ProblemContribution } from '@theia/markers/lib/browser/problem/problem-contribution';
import { ProblemStat } from '@theia/markers/lib/browser/problem/problem-manager';
import { ConfigProvider } from './config/config-provider';

export const FocusProblemsCommand: Command = Command.toDefaultLocalizedCommand({
    id: 'workbench.action.problems.focus',
    label: 'Focus Problems (Errors, Warnings, Infos)',
});

@injectable()
export class YukibanaProblemContributioun extends ProblemContribution {
    @inject(ConfigProvider) protected readonly configProvider: ConfigProvider;
    @inject(ILogger) @named('yukibana:ProblemContribution') protected readonly logger: ILogger;

    @postConstruct()
    init(): void {
        this.configProvider.onConfigChanged(e => this.updateStatusBarElement());
    }

    protected setStatusBarElement(problemStat: ProblemStat): void {
        if (this.configProvider.config.features.squiggles === false) {
            this.statusBar.removeElement('problem-marker-status');
            return;
        }
        super.setStatusBarElement(problemStat);
    }
}

@injectable()
export class YukibanaProblemCommandContribution implements CommandContribution {
    @inject(ProblemContribution) protected readonly problemView: ProblemContribution;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(FocusProblemsCommand, {
            execute: async () => {
                await this.problemView.openView({
                    activate: true,
                    reveal: true,
                });
            },
        });
    }
}
