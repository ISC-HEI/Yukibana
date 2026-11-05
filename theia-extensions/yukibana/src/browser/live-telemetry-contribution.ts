import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { LiveTelemetryReporter } from '../common/yukibana-telemetry';
import { ConfigProvider } from './config/config-provider';
import { LiveTelemetryFrontendImpl } from './live-telemetry-frontend';

@injectable()
export class LiveTelemetryContribution implements FrontendApplicationContribution {
    @inject(ConfigProvider) protected readonly configProvider!: ConfigProvider;
    @inject(LiveTelemetryReporter) protected readonly reporter!: LiveTelemetryReporter;
    @inject(LiveTelemetryFrontendImpl) protected readonly telemetryFrontend!: LiveTelemetryFrontendImpl;

    async onStart(app: FrontendApplication): Promise<void> {
        const config = await this.configProvider.ready;
        await this.reporter.start({
            projectId: config.projectId ?? '',
        });
        this.reporter.send({ type: 'ping' });
    }
}
