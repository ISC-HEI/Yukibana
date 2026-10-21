/**
 * SPDX-License-Identifier: MIT
 */
import { Command, CommandContribution, CommandRegistry, CommandService, ContributionProvider, ILogger, MessageService, nls, URI } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { TelemetryService } from '@theia/telemetry/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { ConfigProvider } from 'yukibana-ext/lib/browser/config/config-provider';
import { SubmissionOptions, SubmissionService } from '../common/submission-protocol';
import { SubmissionResult, SubmissionTarget } from '../common/submission-target';
import { SubmissionTelemetry } from '../common/submission-telemetry';
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
    @inject(TelemetryService) protected readonly telemetry!: TelemetryService;
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
                    respectGitignore: config.submission.respectGitignore,
                };
                const preview = await this.submissionService.previewSubmission(options);
                const targetId = config.submission.target;
                const target: SubmissionTarget | undefined = this.getTarget(targetId);
                if (target === undefined) {
                    this.messageService.error(nls.localize('yukibana/submission/unknownTarget', 'Unknown submission target \'{0}\'', targetId));
                    return;
                }
                const confirmed = await new SubmissionSummaryDialog(preview, target, this.commandService).open();
                if (!confirmed) {
                    return;
                }
                await this.prepareAndSubmit(config.submission.target, config.projectId, options);
            }
        });
    }

    private async prepareAndSubmit(target: string, projectId: string, options: SubmissionOptions): Promise<void> {
        const start = Date.now();
        let stage: SubmissionTelemetry.SubmitStage = 'prepare';
        let outcome: SubmissionTelemetry.SubmitOutcome = 'error';
        let outputUri: string | undefined;
        let error: string | undefined;

        try {
            const progress = await this.messageService.showProgress({ text: nls.localize('yukibana/submission/submitProgress', 'Submitting') });
            progress.report({
                message: nls.localize('yukibana/submission/preparing', 'Preparing...')
            });
            const meta = await this.submissionService.prepareSubmission(options);
            outputUri = meta.outputUri;

            stage = 'transmit';

            this.logger.info(`Prepared submission (${meta.fileCount} files)`);
            progress.report({
                message: nls.localize('yukibana/submission/transmitting', 'Transmitting...')
            });
            const result = await this.submit(target, projectId, new URI(outputUri));
            progress.cancel();
            if (!result.ok) {
                this.messageService.error(
                    nls.localize('yukibana/submission/submitFail', 'Failed to submit: {0}', result.reason),
                    { timeout: 5000 },
                );
                error = result.reason;
                return;
            }

            outcome = 'submitted';
            this.messageService.info(
                nls.localize('yukibana/submission/submitSuccess', 'Submitted successfully'),
                { timeout: 5000 },
            );
            this.report(outcome, stage, start, projectId);
        } finally {
            if (outcome !== 'submitted') {
                this.report(outcome, stage, start, projectId, error);
            }
            if (!!outputUri) {
                await this.submissionService.cleanSubmission(outputUri);
            }
        }
    }

    private report(outcome: SubmissionTelemetry.SubmitOutcome, stage: SubmissionTelemetry.SubmitStage, start: number, projectId?: string, error?: string): void {
        const durationMs = (Date.now()) - start;
        const data = {
            outcome: outcome,
            stage: stage,
            durationMs: durationMs,
            projectId: projectId ?? '',
            error: error ?? '',
        } satisfies SubmissionTelemetry.SubmitData;
        this.telemetry.report(
            SubmissionTelemetry.SubmitURI,
            data,
            {
                kind: (outcome === 'submitted' || outcome === 'cancelled') ? 'usage' : 'error',
            }
        );
    }

    private async submit(targetId: string, projectId: string, archiveURI: URI): Promise<SubmissionResult> {
        const target: SubmissionTarget | undefined = this.getTarget(targetId);
        if (target === undefined) {
            return {
                ok: false,
                reason: nls.localize('yukibana/submission/unknownTarget', 'Unknown submission target \'{0}\'', targetId)
            };
        }
        const availability = await target.getAvailability();
        if (!availability.available) {
            return {
                ok: false,
                reason: nls.localize('yukibana/submission/targetUnavailable', 'Submission target is unavailable: {0}', availability.reason)
            };
        }
        return target.submit(projectId, archiveURI);
    }

    private getTarget(targetId: string): SubmissionTarget | undefined {
        return this.targets.getContributions().filter(t => t.id === targetId)[0];
    }
}
