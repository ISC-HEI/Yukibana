/**
 * SPDX-License-Identifier: MIT
 */
import { URI } from '@theia/core';

export const SubmissionTarget = Symbol('SubmissionTarget');

export interface SubmissionResult {
    ok: boolean;
}

export interface SubmissionTarget {
    readonly id: string;
    readonly label: string;
    isAvailable(): Promise<boolean>;
    submit(projectId: string, archive: URI): Promise<SubmissionResult>;
}
