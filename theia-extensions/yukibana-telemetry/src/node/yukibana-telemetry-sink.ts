/**
 * SPDX-License-Identifier: MIT
 */
import { injectable } from '@theia/core/shared/inversify';
import { TelemetryEvent } from '@theia/telemetry/lib/common/telemetry-protocol';
import { TelemetrySink } from '@theia/telemetry/lib/node';

const BATCH_SIZE = 50;
const MAX_DRAIN_DELAY_MS = 10_000;
const ENDPOINT = 'http://localhost:5432/telemetry';

@injectable()
export class YukibanaTelemetrySink implements TelemetrySink {
    readonly id = 'yukibana/usage';
    readonly interests: readonly string[] = ['yukibana/*'];
    readonly scope = 'remote';

    private queue: TelemetryEvent[] = [];
    private timer?: NodeJS.Timeout;

    handle(event: TelemetryEvent): void {
        this.queue.push(event);
        if (this.queue.length >= BATCH_SIZE) {
            this.drain();
        } else {
            this.timer ??= setTimeout(() => this.drain(), MAX_DRAIN_DELAY_MS);
        }
    }

    private async drain(): Promise<void> {
        clearTimeout(this.timer);
        this.timer = undefined;
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

    private async sendBatch(batch: TelemetryEvent[]): Promise<void> {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(batch),
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) {
            throw new Error(`${res.status} ${res.statusText}`);
        }
    }
}
