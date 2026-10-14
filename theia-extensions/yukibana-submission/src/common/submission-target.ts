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

export interface SubmissionTarget {
    readonly id: string;
    readonly label: string;
    isAvailable(): Promise<boolean>;
    submit(projectId: string, archive: URI): Promise<SubmissionResult>;
}
