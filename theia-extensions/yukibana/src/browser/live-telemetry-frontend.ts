import { Emitter } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { LiveTelemetry, LiveTelemetryFrontend } from '../common/yukibana-telemetry';

@injectable()
export class LiveTelemetryFrontendImpl implements LiveTelemetryFrontend {
    protected readonly onCommandEmitter = new Emitter<LiveTelemetry.ServerToClientPayload>();
    readonly onCommand$ = this.onCommandEmitter.event;

    onCommand(cmd: LiveTelemetry.ServerToClientPayload): void {
        this.onCommandEmitter.fire(cmd);
    }
}
