/**
 * SPDX-License-Identifier: MIT
 */
export namespace SubmissionTelemetry {
    export const SubmitURI = 'yukibana/submission/submit';
    export type SubmitStage = 'prepare' | 'transmit' | 'clean';
    export type SubmitOutcome = 'submitted' | 'cancelled' | 'error';
    export interface SubmitData {
        outcome: SubmitOutcome;
        stage: SubmitStage;
        durationMs: number;
        projectId: string;
        error: string;
    }
}
