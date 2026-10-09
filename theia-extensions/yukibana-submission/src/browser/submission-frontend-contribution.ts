/**
 * SPDX-License-Identifier: MIT
 */
import { Command, CommandContribution, CommandRegistry, CommandService, ContributionProvider, ILogger, MessageService, nls, URI } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { ConfigProvider } from 'yukibana-ext/lib/browser/config/config-provider';
import { SubmissionOptions, SubmissionService } from '../common/submission-protocol';
import { SubmissionTarget } from '../common/submission-target';
import { SubmissionSummaryDialog } from './submission-summary-dialog';

export const SubmitCommand: Command = Command.toLocalizedCommand({
    id: 'yukibana.submitAssignment',
    label: 'Submit assignment...',
}, 'yukibana/submission/submitAssignment');

@injectable()
export class SubmitCommandContribution implements CommandContribution {
    @inject(SubmissionService) protected readonly submissionService!: SubmissionService;
    @inject(WorkspaceService) protected readonly workspaceService!: WorkspaceService;
    @inject(ConfigProvider) protected readonly configProvider!: ConfigProvider;
    @inject(MessageService) protected readonly messageService!: MessageService;
    @inject(CommandService) protected readonly commandService!: CommandService;
    @inject(ILogger) @named('yukibana:SubmitCommand') protected readonly logger!: ILogger;

    @inject(ContributionProvider) @named(SubmissionTarget) protected readonly targets!: ContributionProvider<SubmissionTarget>;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SubmitCommand, {
            execute: async () => {
                await this.configProvider.ready;
                const config = this.configProvider.config;
                const root = (await this.workspaceService.roots)[0].resource;
                const options: SubmissionOptions = {
                    workspaceUri: root.toString(),
                    include: config.submission.include,
                    exclude: config.submission.exclude,
                    outputUri: root.resolve(config.submission.filename).toString(),
                    respectGitignore: config.submission.respectGitignore,
                };
                const preview = await this.submissionService.previewSubmission(options);
                const confirmed = await new SubmissionSummaryDialog(preview).open();
                if (!confirmed) {
                    return;
                }
                const { outputUri, fileCount } = await this.submissionService.prepareSubmission(options);
                this.logger.info(`Prepared submission (${fileCount} files)`);
                const ok = await this.submit(config.submission.target, config.projectId, new URI(outputUri));
                if (ok) {
                    this.messageService.info(
                        nls.localize('yukibana/submission/submitSuccess', 'Submitted successfully'),
                        { timeout: 5000 },
                    );
                } else {
                    this.messageService.error(
                        nls.localize('yukibana/submission/submitFail', 'Failed to submit'),
                        { timeout: 5000 },
                    );
                }
            }
        });
    }

    private async submit(targetId: string, projectId: string, archiveURI: URI): Promise<boolean> {
        const availableTargets = new Map<string, SubmissionTarget>();
        for (const t of this.targets.getContributions()) {
            if (await t.isAvailable()) {
                availableTargets.set(t.id, t);
            } else {
                this.logger.warn(`Submission target '${t.id}' is not available`);
            }
        }
        const target = availableTargets.get(targetId);
        if (!target) {
            return false;
        }
        return (await target.submit(projectId, archiveURI)).ok;
    }
}
