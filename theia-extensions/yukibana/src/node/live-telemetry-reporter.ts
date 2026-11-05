import { ContributionProvider, DisposableCollection, ILogger } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { LiveSessionContext, LiveTelemetry, LiveTelemetryFrontend, LiveTelemetryReporter, LiveTelemetrySink } from '../common/yukibana-telemetry';

export const LIVE_PATH = 'yukibana/live-telemetry';

@injectable()
export class LiveTelemetryReporterImpl implements LiveTelemetryReporter {
    @inject(ContributionProvider) @named(LiveTelemetrySink) protected sinks: ContributionProvider<LiveTelemetrySink>;
    @inject(ILogger) @named('yukibana:LiveTelemetryReporter') protected readonly logger!: ILogger;

    protected client?: LiveTelemetryFrontend;
    protected readonly toDispose = new DisposableCollection();

    setClient(client: LiveTelemetryFrontend | undefined): void {
        this.client = client;
    }

    getClient(): LiveTelemetryFrontend | undefined {
        return this.client;
    }

    async start(ctx: LiveSessionContext): Promise<void> {
        this.logger.info('Starting');
        for (const sink of this.sinks.getContributions()) {
            if (sink.onCommand) {
                this.toDispose.push(sink.onCommand(cmd => this.client?.onCommand(cmd)));
            }
            try {
                await sink.start(ctx);
            } catch {}
        }
    }

    send(payload: LiveTelemetry.ClientToServerPayload) {
        this.logger.info(`Sending ${payload}`);
        for (const sink of this.sinks.getContributions()) {
            try {
                sink.send(payload);
            } catch {}
        }
    }

    dispose(): void {
        this.toDispose.dispose();
        this.sinks.getContributions().forEach(s => s.dispose());
        this.client = undefined;
    }
}
