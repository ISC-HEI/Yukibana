/**
 * SPDX-License-Identifier: MIT
 */
import { ContributionProvider, Disposable } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { LiveSessionContext, LiveTelemetry, LiveTelemetryClient, LiveTelemetryService, LiveTelemetrySink, LiveTelemetrySinkHost } from '../common/yukibana-telemetry';
import { LiveTelemetrySinkContribution } from './live-telemetry-sink-contribution';

@injectable()
export class LiveTelemetryServiceImpl implements LiveTelemetryService, LiveTelemetrySinkHost, Disposable {
    @inject(ContributionProvider) @named(LiveTelemetrySinkContribution) protected readonly sinkContributions!: ContributionProvider<LiveTelemetrySinkContribution>;

    protected client: LiveTelemetryClient | undefined;
    protected sinks: LiveTelemetrySink[] = [];

    start(ctx: LiveSessionContext): void {
        for (const contribution of this.sinkContributions.getContributions()) {
            const sink = contribution.create(ctx, this);
            this.sinks.push(sink);
        }
    }

    report(event: LiveTelemetry.ClientToServerPayload): void {
        this.sinks.forEach(sink => sink.send(event));
    }

    dispose(): void {
        this.stop();
    }

    stop(): void {
        this.sinks.forEach(sink => sink.dispose());
        this.sinks = [];
    }

    setClient(client: LiveTelemetryClient | undefined): void {
        this.client = client;
    }

    getClient(): LiveTelemetryClient | undefined {
        return this.client;
    }

    dispatch(command: LiveTelemetry.ServerToClientPayload): void {
        this.client?.onCommand(command);
    }
}
