/**
 * SPDX-License-Identifier: MIT
 */
import { FileUri } from '@theia/core/lib/node';
import { injectable } from '@theia/core/shared/inversify';
import { createSubmissionBundle, SubmissionBundle } from '@yukibana/cli';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { SubmissionPreview, SubmissionService } from '../common/submission-protocol';

/**
 * Submissions packed by `@yukibana/cli`, so the IDE sends exactly the files `yukibana submit` would, held in memory
 * under an id from `prepare` until `release`. Nothing is written to disk unless `save` is asked to.
 */
@injectable()
export class SubmissionServiceImpl implements SubmissionService {
    protected readonly prepared = new Map<string, SubmissionBundle>();

    async prepare(workspaceUri: string): Promise<SubmissionPreview> {
        const made = await createSubmissionBundle(FileUri.fsPath(workspaceUri));
        if (!made.ok) {
            throw new Error(made.problems.join('; '));
        }
        const { bundle } = made;
        const id = randomUUID();
        this.prepared.set(id, bundle);
        return {
            id,
            projectId: bundle.projectId,
            entries: bundle.files.map(f => ({ path: f.path, size: f.size })),
            skipped: bundle.skipped,
            problems: bundle.problems,
            totalSize: bundle.totalBytes,
        };
    }

    /** Returns submission `id` as `prepare` made it, or `undefined` once it is released. */
    bundle(id: string): SubmissionBundle | undefined {
        return this.prepared.get(id);
    }

    async save(id: string, destinationUri: string): Promise<boolean> {
        const bundle = this.bundle(id);
        if (bundle === undefined) {
            return false;
        }
        await fs.promises.writeFile(FileUri.fsPath(destinationUri), await bundle.archive());
        return true;
    }

    async release(id: string): Promise<void> {
        this.prepared.delete(id);
    }
}
