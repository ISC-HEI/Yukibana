/**
 * SPDX-License-Identifier: MIT
 */
import type { Folder, FolderEntry, Version } from '@yukibana/cli';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Reading and writing a student's folder for an update.
 *
 * Every `root` is the absolute path of a folder, and every `file` a path relative to it with forward slashes for
 * which {@link isInside} holds. Symlinks are never followed: one where a file goes is replaced, not written through.
 */

/** Returns the SHA-256 of `bytes`, in hex. */
export function sha256(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
}

/** Returns `true` iff `file` is a relative path with forward slashes that stays inside the folder it is relative to. */
export function isInside(file: string): boolean {
    return file !== '' && !file.startsWith('/') && !file.includes('\\') && !file.split('/').some(s => s === '' || s === '.' || s === '..');
}

/**
 * Returns the file system path of `file` in `root`.
 *
 * - Requires: `isInside(file)`.
 */
export function fullPath(root: string, file: string): string {
    if (!isInside(file)) {
        throw new Error(`Refusing a path outside the project: ${file}`);
    }
    return path.join(root, ...file.split('/'));
}

/** Writes `data` with permission bits `mode` to `target`, creating its folder, so that a reader never sees half of it. */
export async function writeAtomically(target: string, data: Uint8Array, mode: number): Promise<void> {
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.yukibana-${process.pid}-${Date.now()}.tmp`;
    await fs.promises.writeFile(temp, data, { mode });
    await fs.promises.chmod(temp, mode);
    await fs.promises.rename(temp, target);
}

/** Writes `value` as JSON to `target`, atomically. */
export async function writeJson(target: string, value: unknown): Promise<void> {
    await writeAtomically(target, new TextEncoder().encode(JSON.stringify(value, undefined, 2)), 0o644);
}

/**
 * Returns the relative paths of every file in `root` outside the folders `skip` accepts, at most `limit` of them.
 *
 * Unreadable folders are left out.
 */
export async function walk(root: string, skip: (file: string) => boolean, limit: number): Promise<string[]> {
    const found: string[] = [];
    const visit = async (dir: string, prefix: string): Promise<void> => {
        for (const entry of await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])) {
            if (found.length >= limit) {
                return;
            }
            const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
            if (skip(rel)) {
                continue;
            }
            if (entry.isDirectory()) {
                await visit(path.join(dir, entry.name), rel);
            } else {
                found.push(rel);
            }
        }
    };
    await visit(root, '');
    return found;
}

/**
 * Returns what `root` holds at each of `files`, leaving out the ones it does not have.
 *
 * A path counts as present only when spelled exactly as on disk, so that on a disk that ignores case `Foo.rs` does
 * not answer for `foo.rs`. Paths for which {@link isInside} does not hold are left out.
 */
export async function snapshot(root: string, files: readonly string[]): Promise<Folder> {
    const folder = new Map<string, FolderEntry>();
    const listings = new Map<string, Promise<Set<string>>>();
    for (const file of files.filter(isInside)) {
        const full = fullPath(root, file);
        const stat = await fs.promises.lstat(full).catch(() => undefined);
        if (stat === undefined || !(await namedExactly(full, listings))) {
            continue;
        }
        folder.set(file, stat.isFile() ? { kind: 'file', data: new Uint8Array(await fs.promises.readFile(full)), mode: stat.mode & 0o777 } : { kind: 'other' });
    }
    return folder;
}

/** Returns `true` iff the folder holding `full` lists its last name spelled exactly so; `listings` caches folder listings. */
async function namedExactly(full: string, listings: Map<string, Promise<Set<string>>>): Promise<boolean> {
    const dir = path.dirname(full);
    let names = listings.get(dir);
    if (names === undefined) {
        names = fs.promises.readdir(dir).then(
            found => new Set(found),
            () => new Set<string>(),
        );
        listings.set(dir, names);
    }
    return (await names).has(path.basename(full));
}

/** Returns the first folder on the way to `file` that is something else in `root`, or `undefined` when there is none. */
export async function blockingParent(root: string, file: string): Promise<string | undefined> {
    const parts = file.split('/');
    for (let i = 1; i < parts.length; i++) {
        const stat = await fs.promises.lstat(path.join(root, ...parts.slice(0, i))).catch(() => undefined);
        if (stat === undefined) {
            return undefined;
        }
        if (!stat.isDirectory()) {
            return parts.slice(0, i).join('/');
        }
    }
    return undefined;
}

/**
 * Makes `file` in `root` hold `version`, or removes it when `version` is `undefined`.
 *
 * A symlink at `file` is replaced; a missing file is already removed.
 * - Requires: `file` is not a folder in `root`.
 */
export async function place(root: string, file: string, version: Version | undefined): Promise<void> {
    const full = fullPath(root, file);
    const stat = await fs.promises.lstat(full).catch(() => undefined);
    if (stat?.isDirectory()) {
        throw new Error(`${file} is a folder in your project, where your teacher's version has a file. Move it away and update again.`);
    }
    if (version === undefined) {
        await removeFile(root, file);
        return;
    }
    if (stat?.isSymbolicLink()) {
        await fs.promises.rm(full, { force: true });
    }
    await writeAtomically(full, version.data, version.mode & 0o777 || 0o644);
}

/**
 * Removes the file or symlink at `file` in `root`.
 *
 * Nothing there, or something under a path that is not a folder, is already removed; a folder there is left as it is.
 */
export async function removeFile(root: string, file: string): Promise<void> {
    const full = fullPath(root, file);
    const stat = await fs.promises.lstat(full).catch(() => undefined);
    if (stat !== undefined && !stat.isDirectory()) {
        await fs.promises.rm(full, { force: true });
    }
}

/**
 * Returns a hash of what `root` holds at `file`, or `undefined` when it holds nothing there.
 *
 * Two hashes are equal iff the path holds the same bytes, or a symlink to the same target; every folder hashes alike.
 */
export async function hashOf(root: string, file: string): Promise<string | undefined> {
    const full = fullPath(root, file);
    const stat = await fs.promises.lstat(full).catch(() => undefined);
    if (stat === undefined) {
        return undefined;
    }
    if (stat.isSymbolicLink()) {
        return sha256(new TextEncoder().encode(`symlink:${await fs.promises.readlink(full)}`));
    }
    return stat.isFile() ? sha256(new Uint8Array(await fs.promises.readFile(full))) : 'not a file';
}

/**
 * Makes `file` in `root` the symlink to `target`.
 *
 * - Requires: `root` holds nothing at `file`.
 */
export async function placeSymlink(root: string, file: string, target: string): Promise<void> {
    await fs.promises.symlink(target, fullPath(root, file));
}
