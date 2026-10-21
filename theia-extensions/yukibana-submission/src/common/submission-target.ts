/**
 * SPDX-License-Identifier: MIT
 */
import { URI } from '@theia/core';

export const SubmissionTarget = Symbol('SubmissionTarget');

export type SubmissionResult = {
    readonly ok: true
} | {
    readonly ok: false,
    readonly reason: string
};

export type SubmissionTargetAvailability = {
    readonly available: true
} | {
    readonly available: false,
    readonly reason: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly actions: { label: string, command: string, args?: any[] }[]
};

export interface SubmissionTarget {
    readonly id: string;
    readonly label: string;
    getAvailability(): Promise<SubmissionTargetAvailability>;
    submit(projectId: string, archive: URI): Promise<SubmissionResult>;
}
