/**
 * SPDX-License-Identifier: MIT
 */
import { Emitter, ILogger } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { WebSocket } from 'ws';
import { LiveSessionContext, LiveTelemetry, LiveTelemetrySink, LiveTelemetrySinkHost } from 'yukibana-ext/lib/common/yukibana-telemetry';
import { LiveTelemetrySinkContribution } from 'yukibana-ext/lib/node/live-telemetry-sink-contribution';

const BATCH_SIZE = 50;
const MAX_DRAIN_DELAY_MS = 1_000;
const WS_URL = 'ws://localhost:5432/ws/student';

export class YukibanaLiveWebsocketTelemetrySink implements LiveTelemetrySink {
    protected queue: LiveTelemetry.Envelope<LiveTelemetry.ClientToServerPayload>[] = [];
    protected timer?: NodeJS.Timeout;
    protected ws?: WebSocket;
    protected seq: number = 0;

    protected readonly onCommandEmitter = new Emitter<LiveTelemetry.ServerToClientPayload>();
    readonly onCommand = this.onCommandEmitter.event;

    constructor(
        protected readonly logger: ILogger,
        protected readonly host: LiveTelemetrySinkHost,
        protected readonly sessionCtx: LiveSessionContext,
    ) {
        this.start();
    }

    protected start(): void {
        this.logger.info('Starting');
        return this.open();
    }

    dispose(): void {
        this.close();
    }

    protected open(): void {
        this.logger.info(`Connecting to ${WS_URL}`);
        this.ws = new WebSocket(WS_URL);
        this.ws.on('error', e => {
            this.logger.error(e);
        });
        this.ws.on('open', async () => {
            this.sendHello();
        });
        this.ws.on('message', e => {
            this.logger.info(`WS message: ${e}`);
            const msg = JSON.parse(e.toString()) as LiveTelemetry.Envelope<LiveTelemetry.ServerToClientPayload>;
            this.onCommandEmitter.fire(msg.payload);
        });
    }
    protected close(): void {
        this.logger.info('Closing websocket');
        this.ws?.close();
    }

    protected sendHello(): void {
        this.send({
            type: 'hello',
            studentId: '',
            projectId: this.sessionCtx?.projectId ?? '',
        });
    }

    send(payload: LiveTelemetry.ClientToServerPayload): void {
        this.logger.info(`Sending payload of type ${payload.type}`);
        const message: LiveTelemetry.Envelope<LiveTelemetry.ClientToServerPayload> = {
            v: 1,
            seq: this.seq++,
            ts: Date.now(),
            payload: payload,
        };
        this.queue.push(message);
        if (this.mustSendImmediately(payload) || this.queue.length >= BATCH_SIZE) {
            this.drain();
        } else {
            this.timer ??= setTimeout(() => this.drain(), MAX_DRAIN_DELAY_MS);
        }
    }

    protected mustSendImmediately(payload: LiveTelemetry.ClientToServerPayload): boolean {
        if (payload.type === 'hello' || (payload.type === 'doc' && payload?.full !== undefined) || payload.type === 'ping') {
            return true;
        }
        return false;
    }

    protected async drain(): Promise<void> {
        clearTimeout(this.timer);
        this.timer = undefined;
        if (!this.ws) {
            return;
        }
        const batch = this.queue.splice(0);
        if (!batch.length) {
            return;
        }
        try {
            await this.sendBatch(batch);
        } catch {
            this.queue.unshift(...batch);
        }
    }

    protected async sendBatch(batch: LiveTelemetry.Envelope<LiveTelemetry.ClientToServerPayload>[]): Promise<void> {
        if (!this.ws) {
            return;
        }
        this.ws.send(
            JSON.stringify({
                identity: {
                    provider: 'none',
                    id: 'unique-id',
                },
                events: batch,
            }),
        );
    }
}

@injectable()
export class YukibanaLiveWebsocketTelemetrySinkContribution implements LiveTelemetrySinkContribution {
    @inject(ILogger) @named('yukibana:LiveWebsocketTelemetrySink') protected readonly logger!: ILogger;

    create(ctx: LiveSessionContext, host: LiveTelemetrySinkHost): LiveTelemetrySink {
        return new YukibanaLiveWebsocketTelemetrySink(this.logger, host, ctx);
    }
}
