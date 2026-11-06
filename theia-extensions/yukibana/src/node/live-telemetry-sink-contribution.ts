/**
 * SPDX-License-Identifier: MIT
 */
import { LiveSessionContext, LiveTelemetrySink, LiveTelemetrySinkHost } from '../common/yukibana-telemetry';

export const LiveTelemetrySinkContribution = Symbol('LiveTelemetrySinkContribution');
export interface LiveTelemetrySinkContribution {
    create(ctx: LiveSessionContext, host: LiveTelemetrySinkHost): LiveTelemetrySink;
}
