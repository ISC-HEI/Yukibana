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
    respectGitignore?: boolean;
}

export interface SubmissionEntry {
    path: string;
    size: number;
}

export interface SubmissionPreview {
    entries: SubmissionEntry[];
    totalSize: number;
}

export interface SubmissionService {
    previewSubmission(options: SubmissionOptions): Promise<SubmissionPreview>;
    prepareSubmission(options: SubmissionOptions): Promise<{ outputUri: string, fileCount: number }>;
}
