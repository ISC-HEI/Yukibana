/**
 * SPDX-License-Identifier: MIT
 */
export const submissionServicePath = '/services/yukibana/submission';
export const SubmissionService = Symbol('SubmissionService');

export interface SubmissionOptions {
    workspaceUri: string;
    include?: string[];
    exclude?: string[];
    outputUri?: string;
}

export interface SubmissionService {
    prepareSubmission(options: SubmissionOptions): Promise<{ outputUri: string, fileCount: number }>;
}
