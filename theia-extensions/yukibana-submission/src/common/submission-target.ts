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
    readonly available: true,
    readonly message?: string
} | {
    readonly available: false,
    readonly reason: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly actions: { label: string, command: string | (() => Promise<void>), args?: any[] }[]
};

export interface SubmissionTarget {
    readonly id: string;
    readonly label: string;
    getAvailability(projectId: string): Promise<SubmissionTargetAvailability>;
    submit(projectId: string, archive: URI): Promise<SubmissionResult>;
}
