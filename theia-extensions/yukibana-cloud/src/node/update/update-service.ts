/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger } from '@theia/core';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FileUri } from '@theia/core/lib/node';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import {
    Change,
    Entry,
    Folder,
    FolderEntry,
    isText,
    matcher,
    onlyTheStamp,
    parseConfig,
    planUpdate,
    readArchive,
    submissionRoot,
    UpdatePlan,
    Version,
    wantedPaths,
} from '@yukibana/cli';
import { buildOutput, Config, CONFIG_FILE, NEVER_SUBMITTED } from '@yukibana/cli/config';
import * as fs from 'fs';
import * as path from 'path';
import { messageOf } from '../../common/errors';
import {
    isDecided,
    NO_UPDATE,
    PendingRow,
    Resolution,
    UndoResult,
    UpdateResult,
    UpdateRow,
    UpdateRows,
    UpdateService,
    UpdateSide,
    UpdateState,
} from '../../common/update-protocol';
import { CloudClient } from '../cloud-client';
import { blockingParent, isInside, place, sha256, snapshot, walk, writeAtomically } from './folder';
import { Journal, Manifest } from './journal';

/** The release a folder started from, and the project it is of, as its `yukibana.json` says. */
interface Stamp {
    readonly projectId: string;
    /** The release's id, in lower case. */
    readonly releaseId: string;
}

/** A plan for updating a folder, with what the frontend is shown of it. */
interface Planned extends UpdateRows {
    readonly plan: UpdatePlan;
    /** The folder at every path the plan needed. */
    readonly folder: Folder;
}

/** The folders never walked when looking for protected files: history, installed packages. */
const UNWALKED = ['.git', ...NEVER_SUBMITTED];

/** The most files a walk lists; a source folder is far smaller. */
const MAX_FILES = 50_000;

/**
 * The backend of assignment updates: the registry, the student's folder, and the journal of the last update.
 *
 * Invariant: no two operations on one folder run at once (see {@link serially}), and no operation but a rollback
 * reads a folder whose journal is `applying`.
 */
@injectable()
export class UpdateServiceImpl implements UpdateService {
    @inject(CloudClient) protected readonly client!: CloudClient;
    @inject(EnvVariablesServer) protected readonly env!: EnvVariablesServer;
    @inject(ILogger) @named('yukibana:Update') protected readonly logger!: ILogger;

    /** The starters read so far, by release id in lower case. A release never changes, so neither does an entry. */
    protected readonly starters = new Map<string, Promise<readonly Entry[]>>();
    /** The last operation on each folder, by its path, settled or not. */
    protected readonly queues = new Map<string, Promise<unknown>>();

    check(workspace: string): Promise<UpdateState> {
        return this.serially(workspace, root => this.checkNow(root));
    }

    update(workspace: string, to: string, confirmed: readonly string[]): Promise<UpdateResult> {
        return this.serially(workspace, async root => {
            try {
                return await this.updateNow(root, to.toLowerCase(), confirmed);
            } catch (e) {
                this.logger.error(`Update of ${root} to ${to} failed`, e);
                // Put back what it wrote now, before anything plans over a half-written folder
                const reason = await this.rollBackIfApplying(root).then(
                    () => messageOf(e),
                    (r: unknown) => `${messageOf(e)} Putting your files back also failed: ${messageOf(r)}`,
                );
                return { kind: 'failed', reason };
            }
        });
    }

    resolve(workspace: string, file: string, resolution: Resolution): Promise<UpdateState> {
        return this.serially(workspace, async root => {
            const journal = await this.journalOf(root);
            const manifest = await journal.manifest();
            const row = manifest?.state === 'done' ? manifest.pending.find(r => r.path === file) : undefined;
            if (manifest === undefined || row === undefined) {
                return this.checkNow(root);
            }
            if (resolution === 'teacher' || resolution === 'delete') {
                const theirs = resolution === 'teacher' ? fileIn(await this.starter(manifest.to), file) : undefined;
                if (resolution === 'teacher' && theirs === undefined) {
                    throw new Error(`The teacher's version has no ${file}`);
                }
                await this.place(root, file, theirs);
                manifest.files[file]!.after = theirs && sha256(theirs.data);
            }
            manifest.pending = manifest.pending.filter(r => r.path !== file);
            await journal.save(manifest);
            return this.checkNow(root);
        });
    }

    undo(workspace: string, force: boolean): Promise<UndoResult> {
        return this.serially(workspace, async root => {
            try {
                const journal = await this.journalOf(root);
                const manifest = await journal.manifest();
                if (manifest === undefined) {
                    return { kind: 'failed', reason: 'There is no update to undo.' };
                }
                const changed = force ? [] : await journal.changedSince(manifest);
                if (changed.length > 0) {
                    return { kind: 'confirm', paths: changed };
                }
                await journal.rollBack(manifest);
                return { kind: 'undone', state: await this.checkNow(root) };
            } catch (e) {
                this.logger.error(`Undo in ${root} failed`, e);
                return { kind: 'failed', reason: messageOf(e) };
            }
        });
    }

    async read(workspace: string, side: UpdateSide, file: string): Promise<string> {
        if (!isInside(file)) {
            return '';
        }
        if (side.kind === 'release') {
            const found = fileIn(await this.starter(side.release), file);
            return found === undefined ? '' : new TextDecoder().decode(found.data);
        }
        return (await this.journalOf(FileUri.fsPath(workspace))).before(file);
    }

    /** Rolls back the update of `root` if it did not finish, and returns `true` iff there was one. */
    protected async rollBackIfApplying(root: string): Promise<boolean> {
        const journal = await this.journalOf(root);
        const manifest = await journal.manifest();
        if (manifest?.state !== 'applying') {
            return false;
        }
        this.logger.warn(`Rolling back the unfinished update of ${root} to ${manifest.to}`);
        await journal.rollBack(manifest);
        return true;
    }

    /** Returns the state of `root`; see {@link UpdateService.check}. */
    protected async checkNow(root: string): Promise<UpdateState> {
        let rolledBack: boolean;
        try {
            rolledBack = await this.rollBackIfApplying(root);
        } catch (e) {
            return { ...NO_UPDATE, problem: `An earlier update did not finish, and putting your files back failed: ${messageOf(e)}` };
        }
        const manifest = await (await this.journalOf(root)).manifest();
        const last = manifest && { from: manifest.from, to: manifest.to, at: manifest.at, decided: manifest.decided, pending: manifest.pending };
        // Read after any rollback, which puts the old stamp back
        const stamp = await stampOf(root);
        const base: UpdateState = { rolledBack, ...(last && { last }) };
        if (stamp === undefined) {
            return base;
        }

        const project = await this.client.project(stamp.projectId).catch((e: unknown) => messageOf(e));
        if (typeof project === 'string') {
            return { ...base, problem: project };
        }
        const known: UpdateState = { ...base, ...(project.deadline !== null && { deadline: project.deadline }) };
        const current = project.currentReleaseId?.toLowerCase();
        if (current === undefined || current === stamp.releaseId) {
            return known;
        }
        const planned = await this.plan(root, stamp.releaseId, current).catch((e: unknown) => messageOf(e));
        if (typeof planned === 'string') {
            return { ...known, problem: planned };
        }
        if (onlyTheStamp(planned.plan)) {
            // Nothing the student receives changed (a commit to hidden tests, say): move the stamp and say nothing
            // A starter always has one: `fetchStarter` refuses one whose config does not name its release
            await this.place(root, CONFIG_FILE, fileIn(await this.starter(current), CONFIG_FILE)!);
            this.logger.info(`Moved the stamp of ${root} to ${current}: nothing else changed`);
            return known;
        }
        return { ...known, available: { from: stamp.releaseId, to: current, projectTitle: project.title, decided: planned.decided, pending: planned.pending } };
    }

    /**
     * Updates `root` to release `to`; see {@link UpdateService.update}.
     *
     * - Requires: `to` is in lower case.
     */
    protected async updateNow(root: string, to: string, confirmed: readonly string[]): Promise<UpdateResult> {
        // Never plan over a folder an unfinished update left half-written: its backups are the only copy of the student's files
        await this.rollBackIfApplying(root);
        const stamp = await stampOf(root);
        if (stamp === undefined) {
            return { kind: 'failed', reason: `${CONFIG_FILE} does not say which release this folder started from.` };
        }
        if (stamp.releaseId === to) {
            return { kind: 'updated', state: await this.checkNow(root) };
        }
        const planned = await this.plan(root, stamp.releaseId, to);
        const unconfirmed = planned.decided.filter(r => r.protected && r.editedByStudent && !confirmed.includes(r.path)).map(r => r.path);
        if (unconfirmed.length > 0) {
            return { kind: 'confirm', paths: unconfirmed };
        }

        const journal = await this.journalOf(root);
        const manifest: Manifest = {
            version: 2,
            state: 'applying',
            from: stamp.releaseId,
            to,
            at: new Date().toISOString(),
            files: {},
            decided: planned.decided,
            pending: planned.pending,
        };
        const changes = planned.plan.changes;
        await journal.begin(
            manifest,
            changes.map(c => c.path),
        );
        // In the plan's order, which writes the stamp last
        for (const change of changes) {
            if (change.kind === 'write' || change.kind === 'delete') {
                const version = change.kind === 'write' ? change.theirs : undefined;
                await this.place(root, change.path, version);
                manifest.files[change.path]!.after = version && sha256(version.data);
            }
        }
        manifest.state = 'done';
        await journal.save(manifest);
        this.logger.info(`Updated ${root} from ${manifest.from} to ${to}: ${manifest.decided.length} written, ${manifest.pending.length} left to the student`);
        return { kind: 'updated', state: await this.checkNow(root) };
    }

    /**
     * Returns the plan for updating `root` from release `from` to release `to`.
     *
     * Throws, with a sentence for the student, when the plan cannot be applied: a release that is not what it says, a
     * path outside the project, or a file in the folder where the new release has a folder.
     * - Requires: `from` and `to` are in lower case.
     */
    protected async plan(root: string, from: string, to: string): Promise<Planned> {
        const [base, newest] = await Promise.all([this.starter(from), this.starter(to)]);
        const config = configIn(base);
        const files = await walk(root, matcher([...UNWALKED, ...(config === undefined ? [] : buildOutput(config.kind))]), MAX_FILES);
        const folder = await snapshot(root, wantedPaths(base, newest, files));
        const planned = planUpdate(base, newest, folder);
        if (!planned.ok) {
            throw new Error(planned.problem);
        }
        const { plan } = planned;
        if (plan.to?.toLowerCase() !== to) {
            throw new Error(`The starter of release ${to} says it is release ${plan.to ?? 'none'}.`);
        }
        const outside = plan.changes.find(c => !isInside(c.path));
        if (outside !== undefined) {
            throw new Error(`The new version has a file at ${outside.path}, which is not a path inside a project.`);
        }
        for (const change of plan.changes) {
            const blocked = change.kind === 'write' ? await blockingParent(root, change.path) : undefined;
            if (blocked !== undefined) {
                throw new Error(`${blocked} is a file in your project, where your teacher's new version has a folder (for ${change.path}). Rename or move it, then update again.`);
            }
        }
        const rows = plan.changes.filter(c => c.path !== CONFIG_FILE).map(c => rowOf(c, folder.get(c.path)));
        return { plan, folder, decided: rows.filter(isDecided), pending: rows.filter((r): r is PendingRow => !isDecided(r)) };
    }

    /**
     * Makes `file` in `root` hold `version`, or removes it when `version` is `undefined`.
     *
     * Every write of an update goes through here.
     */
    protected place(root: string, file: string, version: Version | undefined): Promise<void> {
        return place(root, file, version);
    }

    /** Returns the entries of release `id`'s starter, wrapper folder removed, from the cache on disk or the registry. */
    protected starter(id: string): Promise<readonly Entry[]> {
        const key = id.toLowerCase();
        let found = this.starters.get(key);
        if (found === undefined) {
            found = this.fetchStarter(key);
            found.catch(() => this.starters.delete(key));
            this.starters.set(key, found);
        }
        return found;
    }

    /**
     * Returns the entries of release `id`'s starter, reading the registry only when the disk has no copy.
     *
     * - Requires: `id` is in lower case.
     */
    protected async fetchStarter(id: string): Promise<readonly Entry[]> {
        const cached = path.join(await this.storeRoot(), 'releases', `${id}.tar.gz`);
        const bytes = await fs.promises.readFile(cached).catch(() => undefined);
        if (bytes !== undefined) {
            return submissionRoot(await readArchive(new Uint8Array(bytes)));
        }
        const downloaded = await this.client.downloadRelease(id, 'starter');
        const entries = submissionRoot(await readArchive(downloaded));
        // Only an archive that says it is this release is kept under its id
        if (configIn(entries)?.releaseId?.toLowerCase() !== id) {
            throw new Error(`The registry's starter of release ${id} does not say it is that release.`);
        }
        await writeAtomically(cached, downloaded, 0o644);
        return entries;
    }

    /** Returns the folder that holds the starters and the journals. */
    protected async storeRoot(): Promise<string> {
        return path.join(FileUri.fsPath(await this.env.getConfigDirUri()), 'updates');
    }

    /** Returns the journal of the folder at `root`, kept under a hash of its path. */
    protected async journalOf(root: string): Promise<Journal> {
        return new Journal(root, path.join(await this.storeRoot(), 'folders', sha256(new TextEncoder().encode(path.resolve(root))).slice(0, 24)));
    }

    /** Runs `run` on the folder of `workspace` once every earlier operation on it has settled, and returns its result. */
    protected serially<T>(workspace: string, run: (root: string) => Promise<T>): Promise<T> {
        const root = FileUri.fsPath(workspace);
        const result = (this.queues.get(root) ?? Promise.resolve()).catch(() => undefined).then(() => run(root));
        this.queues.set(
            root,
            result.catch(() => undefined),
        );
        return result;
    }
}

/** Returns the stamp of the folder at `root`, or `undefined` when it is not a stamped Yukibana project. */
async function stampOf(root: string): Promise<Stamp | undefined> {
    const text = await fs.promises.readFile(path.join(root, CONFIG_FILE), 'utf8').catch(() => undefined);
    const parsed = text === undefined ? undefined : parseConfig(text);
    if (!parsed?.ok || parsed.config.projectId === null || parsed.config.releaseId === null) {
        return undefined;
    }
    return { projectId: parsed.config.projectId, releaseId: parsed.config.releaseId.toLowerCase() };
}

/** Returns the file at `file` of a starter's `entries`, or `undefined` when it has none. */
function fileIn(entries: readonly Entry[], file: string): Version | undefined {
    const found = entries.find(e => e.path === file && e.type === 'file');
    return found && { data: found.data, mode: found.mode };
}

/** Returns the parsed `yukibana.json` of a starter's `entries`, or `undefined` when it has none that parses. */
function configIn(entries: readonly Entry[]): Config | undefined {
    const config = fileIn(entries, CONFIG_FILE);
    const parsed = config && parseConfig(new TextDecoder().decode(config.data));
    return parsed?.ok ? parsed.config : undefined;
}

/** Returns the row the frontend is shown for `change`, where the folder holds `mine`. */
function rowOf(change: Change, mine: FolderEntry | undefined): UpdateRow {
    const present = mine !== undefined;
    // The releases' versions the row involves; the CLI says "none" with null
    const versions = change.kind === 'write' ? [change.theirs] : change.kind === 'delete' ? [] : [change.theirs, change.base];
    const text = (mine === undefined || (mine.kind === 'file' && isText(mine.data))) && versions.every(v => v === null || isText(v.data));
    switch (change.kind) {
        case 'write':
        case 'delete':
            return {
                path: change.path,
                kind: change.kind,
                text,
                present,
                protected: change.protected,
                editedByStudent: change.editedByStudent,
                newlyProtected: change.newlyProtected,
            };
        case 'merge':
            return { path: change.path, kind: 'merge', text, present };
        case 'choose':
            return { path: change.path, kind: 'choose', reason: change.reason, text, present };
    }
}
