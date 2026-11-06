import { Emitter } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { LiveTelemetry, LiveTelemetryClient } from '../common/yukibana-telemetry';

@injectable()
export class LiveTelemetryClientImpl implements LiveTelemetryClient {
    protected readonly onCommandEmitter = new Emitter<LiveTelemetry.ServerToClientPayload>();
    readonly onCommand$ = this.onCommandEmitter.event;

    onCommand(cmd: LiveTelemetry.ServerToClientPayload): void {
        this.onCommandEmitter.fire(cmd);
    }
}
