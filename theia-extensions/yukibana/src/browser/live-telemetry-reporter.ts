import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { LiveTelemetry, LiveTelemetryService } from '../common/yukibana-telemetry';
import { ConfigProvider } from './config/config-provider';

@injectable()
export class LiveTelemetryReporter implements FrontendApplicationContribution {
    @inject(ConfigProvider) protected readonly configProvider!: ConfigProvider;
    @inject(LiveTelemetryService) protected readonly telemetry!: LiveTelemetryService;

    async onStart(app: FrontendApplication): Promise<void> {
        const config = await this.configProvider.ready;
        if (!config.telemetry.liveTypingStats) {
            return;
        }
        this.telemetry.start({
            projectId: config.projectId ?? '',
        });
        this.telemetry.report({ type: 'ping' } satisfies LiveTelemetry.Ping);
    }
}
