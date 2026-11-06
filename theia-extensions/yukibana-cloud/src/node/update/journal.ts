/**
 * SPDX-License-Identifier: MIT
 */
import { CONFIG_FILE } from '@yukibana/cli/config';
import * as fs from 'fs';
import * as path from 'path';
import { DecidedRow, PendingRow } from '../../common/update-protocol';
import { messageOf } from '../../common/errors';
import { fullPath, hashOf, place, placeSymlink, removeFile, sha256, writeAtomically, writeJson } from './folder';

/** What a path an update touched held before it. */
export type Before = { readonly type: 'absent' } | { readonly type: 'file'; readonly mode: number } | { readonly type: 'symlink'; readonly target: string };

/**
 * The record of the last update of one folder.
 *
 * `state` is `applying` from just before the first write to the folder until after the last; a record found
 * `applying` means the IDE stopped halfway, and must be rolled back before anything else reads the folder.
 * `files` holds every path of the plan, pending ones included, so that undo also puts back what the student merged;
 * its `after` is the {@link hashOf} what the update or a resolution left there, which tells undo whether the student
 * changed the file since.
 */
export interface Manifest {
    /** The format; a record of another one is not read (version 1 had no `decided`). */
    readonly version: 2;
    state: 'applying' | 'done';
    readonly from: string;
    readonly to: string;
    /** When the update was applied, ISO 8601. */
    readonly at: string;
    readonly files: Record<string, { readonly before: Before; after: string | undefined }>;
    readonly decided: readonly DecidedRow[];
    pending: readonly PendingRow[];
}

/**
 * The record of one folder's last update, on disk: `manifest.json`, and the old contents of every file it touched
 * under `before/`.
 *
 * A journal is the only copy of what an update replaced, so nothing removes it but a finished rollback.
 */
export class Journal {
    /** Creates the journal of the folder at `root`, kept in `dir`. */
    constructor(
        readonly root: string,
        protected readonly dir: string,
    ) {}

    /** Returns the record, or `undefined` when there is none or it cannot be read. */
    async manifest(): Promise<Manifest | undefined> {
        const text = await fs.promises.readFile(path.join(this.dir, 'manifest.json'), 'utf8').catch(() => undefined);
        if (text === undefined) {
            return undefined;
        }
        try {
            // Written only by this class, as JSON of a Manifest
            const manifest = JSON.parse(text) as Manifest;
            return manifest.version === 2 ? manifest : undefined;
        } catch {
            return undefined;
        }
    }

    /** Writes `manifest` as the record. */
    async save(manifest: Manifest): Promise<void> {
        await writeJson(path.join(this.dir, 'manifest.json'), manifest);
    }

    /**
     * Backs up every one of `files` and replaces the record with `manifest`, whose `files` it fills in.
     *
     * The old record stays until every backup is written, so a failure here leaves the previous update undoable.
     * - Requires: `manifest.state` is `applying`, and `manifest.files` is empty.
     */
    async begin(manifest: Manifest, files: readonly string[]): Promise<void> {
        const next = `${this.dir}.next`;
        await fs.promises.rm(next, { recursive: true, force: true });
        for (const file of files) {
            manifest.files[file] = await backUp(this.root, file, path.join(next, 'before'));
        }
        await writeJson(path.join(next, 'manifest.json'), manifest);
        await fs.promises.rm(this.dir, { recursive: true, force: true });
        await fs.promises.rename(next, this.dir);
    }

    /** Returns the text `file` held before the last update, or `''` when it held no file. */
    async before(file: string): Promise<string> {
        const manifest = await this.manifest();
        if (manifest?.files[file]?.before.type !== 'file') {
            return '';
        }
        return fs.promises.readFile(fullPath(path.join(this.dir, 'before'), file), 'utf8');
    }

    /** Returns the paths of `manifest` that changed since the update or resolution that last wrote them, sorted. */
    async changedSince(manifest: Manifest): Promise<string[]> {
        const changed: string[] = [];
        for (const [file, { after }] of Object.entries(manifest.files)) {
            if ((await hashOf(this.root, file)) !== after) {
                changed.push(file);
            }
        }
        return changed.sort();
    }

    /**
     * Puts every path of `manifest` back as it was before the update, and removes the record.
     *
     * Every path is tried even when one fails; then the record stays, so that the next check tries again, and the
     * error names every path that failed. The stamp goes last, so that a rollback that stops halfway still leaves an
     * update to roll back.
     */
    async rollBack(manifest: Manifest): Promise<void> {
        const files = Object.entries(manifest.files).sort(([a], [b]) => (a === CONFIG_FILE ? 1 : b === CONFIG_FILE ? -1 : 0));
        const failed: string[] = [];
        for (const [file, { before }] of files) {
            try {
                if (before.type === 'file') {
                    const data = await fs.promises.readFile(fullPath(path.join(this.dir, 'before'), file));
                    await place(this.root, file, { data: new Uint8Array(data), mode: before.mode });
                } else if (before.type === 'symlink') {
                    await removeFile(this.root, file);
                    await placeSymlink(this.root, file, before.target);
                } else {
                    await removeFile(this.root, file);
                }
            } catch (e) {
                failed.push(`${file} (${messageOf(e)})`);
            }
        }
        if (failed.length > 0) {
            throw new Error(`Could not put back ${failed.join(', ')}.`);
        }
        await fs.promises.rm(this.dir, { recursive: true, force: true });
    }
}

/**
 * Copies what `root` holds at `file` into the folder `into`, and returns what it was and its {@link hashOf}.
 *
 * Reads the disk rather than a plan's snapshot, so that a save in between is what gets backed up.
 * - Requires: `file` is not a folder in `root`.
 */
async function backUp(root: string, file: string, into: string): Promise<{ before: Before; after: string | undefined }> {
    const full = fullPath(root, file);
    const stat = await fs.promises.lstat(full).catch(() => undefined);
    if (stat === undefined) {
        return { before: { type: 'absent' }, after: undefined };
    }
    if (stat.isFile()) {
        const data = new Uint8Array(await fs.promises.readFile(full));
        const mode = stat.mode & 0o777;
        await writeAtomically(fullPath(into, file), data, mode);
        return { before: { type: 'file', mode }, after: sha256(data) };
    }
    if (stat.isSymbolicLink()) {
        return { before: { type: 'symlink', target: await fs.promises.readlink(full) }, after: await hashOf(root, file) };
    }
    throw new Error(`${file} is a folder in your project, where your teacher's version has a file. Move it away and update again.`);
}
