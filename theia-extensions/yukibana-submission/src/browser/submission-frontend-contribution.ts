/**
 * SPDX-License-Identifier: MIT
 */
import { Command, CommandContribution, CommandRegistry, CommandService, ContributionProvider, ILogger, MessageService, nls } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { TelemetryService } from '@theia/telemetry/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { ConfigProvider } from 'yukibana-ext/lib/browser/config/config-provider';
import { SubmissionPreview, SubmissionService } from '../common/submission-protocol';
import { SubmissionResult, SubmissionTarget } from '../common/submission-target';
import { SubmissionTelemetry } from '../common/submission-telemetry';
import { SubmissionSummaryDialog } from './submission-summary-dialog';
import { localizeMarkdown } from 'yukibana-common/lib/localize-markdown';

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
                const config = await this.configProvider.ready;
                const targetId = config.submission.target;
                const target = this.getTarget(targetId);
                if (target === undefined) {
                    this.messageService.error(localizeMarkdown('yukibana/submission/unknownTarget', 'Unknown submission target \'{0}\'', targetId));
                    return;
                }
                const root = (await this.workspaceService.roots)[0].resource;
                let preview: SubmissionPreview;
                try {
                    preview = await this.submissionService.prepare(root.toString());
                } catch (e) {
                    this.messageService.error(localizeMarkdown('yukibana/submission/prepareFail', 'Cannot submit this folder: {0}', e instanceof Error ? e.message : String(e)));
                    return;
                }
                try {
                    const projectId = preview.projectId ?? '';
                    if (await new SubmissionSummaryDialog(projectId, preview, target, this.commandService).open()) {
                        await this.send(target, projectId, preview);
                    }
                } finally {
                    await this.submissionService.release(preview.id);
                }
            }
        });
    }

    /** Sends `preview`'s submission to `target`, telling the student how it went and reporting it. */
    private async send(target: SubmissionTarget, projectId: string, preview: SubmissionPreview): Promise<void> {
        const start = Date.now();
        const stage: SubmissionTelemetry.SubmitStage = 'transmit';
        let outcome: SubmissionTelemetry.SubmitOutcome = 'error';
        let error: string | undefined;
        const progress = await this.messageService.showProgress({ text: nls.localize('yukibana/submission/submitProgress', 'Submitting') });
        try {
            this.logger.info(`Submitting ${preview.entries.length} files`);
            progress.report({
                message: nls.localize('yukibana/submission/transmitting', 'Transmitting...')
            });
            const result = await this.submit(target, projectId, preview.id);
            if (!result.ok) {
                this.messageService.error(
                    localizeMarkdown('yukibana/submission/submitFail', 'Failed to submit: {0}', result.reason),
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
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            this.messageService.error(localizeMarkdown('yukibana/submission/submitFail', 'Failed to submit: {0}', error));
        } finally {
            progress.cancel();
            this.report(outcome, stage, start, projectId, error);
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

    private async submit(target: SubmissionTarget, projectId: string, submissionId: string): Promise<SubmissionResult> {
        const availability = await target.getAvailability(projectId);
        if (!availability.available) {
            return {
                ok: false,
                reason: nls.localize('yukibana/submission/targetUnavailable', 'Submission target is unavailable: {0}', availability.reason)
            };
        }
        return target.submit(projectId, submissionId);
    }

    private getTarget(targetId: string): SubmissionTarget | undefined {
        return this.targets.getContributions().find(t => t.id === targetId);
    }
}
