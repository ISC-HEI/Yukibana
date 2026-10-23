/**
 * SPDX-License-Identifier: MIT
 */
export const submissionServicePath = '/services/yukibana/submission';
export const SubmissionService = Symbol('SubmissionService');

/** A file a submission holds, as its preview lists it. */
export interface SubmissionEntry {
    /** Relative to the workspace root, forward slashes. */
    readonly path: string;
    /** Bytes, uncompressed; 0 for a symbolic link. */
    readonly size: number;
}

/**
 * A submission made from the workspace and held by the backend until it is released, as the student checks it
 * before sending: exactly what will be sent, by the same rules as `yukibana submit`.
 */
export interface SubmissionPreview {
    /** Names the submission to `save`, `release` and the submission targets. */
    readonly id: string;
    /** The project the workspace's `yukibana.json` names, if any. */
    readonly projectId: string | null;
    /** What will be sent, in archive order. */
    readonly entries: readonly SubmissionEntry[];
    /** What the rules leave out; a folder left out whole is listed once, as `path/`. */
    readonly skipped: readonly string[];
    /** Reasons it must not be sent, in sentences; it may be sent iff there are none. */
    readonly problems: readonly string[];
    /** The sum of the entries' sizes, uncompressed. */
    readonly totalSize: number;
}

export interface SubmissionService {
    /**
     * Makes a submission of the workspace `workspaceUri`, holds it in memory, and returns its preview.
     *
     * Throws, saying why, when the workspace has no valid `yukibana.json`. Nothing is written to disk.
     */
    prepare(workspaceUri: string): Promise<SubmissionPreview>;
    /**
     * Writes the archive of submission `id`, a `.tar.gz`, to `destinationUri`, and returns `false` iff no such
     * submission is held. Throws when the file cannot be written.
     */
    save(id: string, destinationUri: string): Promise<boolean>;
    /** Forgets submission `id`; a caller of `prepare` releases what it prepared once it is done with it. */
    release(id: string): Promise<void>;
}
