/**
 * SPDX-License-Identifier: MIT
 */
export namespace CloudTelemetry {
    export const OpenProjectURI = 'yukibana/cloud/open-project-uri';
    export type OpenProjectStage = 'parse' | 'info' | 'location' | 'download' | 'window';
    export type OpenProjectOutcome = 'opened' | 'invalid-uri' | 'not-found' | 'no-starter' | 'cancelled' | 'download-failed' | 'error';
    export interface OpenProjectURIData {
        outcome: OpenProjectOutcome;
        stage: OpenProjectStage;
        durationMs: number;
        projectId: string;
        newWindow: boolean;
    }
}
