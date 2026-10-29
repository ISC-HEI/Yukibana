/**
 * SPDX-License-Identifier: MIT
 */
export const SubmissionTarget = Symbol('SubmissionTarget');

export type SubmissionResult =
    | {
          readonly ok: true;
      }
    | {
          readonly ok: false;
          readonly reason: string;
      };

export type SubmissionTargetAvailability =
    | {
          readonly available: true;
          readonly message?: string;
      }
    | {
          readonly available: false;
          readonly reason: string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          readonly actions: { label: string; command: string | (() => Promise<void>); args?: any[] }[];
      };

/** Somewhere a submission can go: the registry, or a file the student saves. */
export interface SubmissionTarget {
    readonly id: string;
    readonly label: string;
    getAvailability(projectId: string): Promise<SubmissionTargetAvailability>;
    /** Sends submission `submissionId`, as `SubmissionService.prepare` made it, for `projectId`, and returns whether it went. */
    submit(projectId: string, submissionId: string): Promise<SubmissionResult>;
}
