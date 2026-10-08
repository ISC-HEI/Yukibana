/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger } from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { TarArchive } from 'archiver';
import fg, { Entry } from 'fast-glob';
import * as fs from 'fs';
import ignore, { Ignore } from 'ignore';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { SubmissionEntry, SubmissionOptions, SubmissionPreview, SubmissionService } from '../common/submission-protocol';

@injectable()
export class SubmissionServiceImpl implements SubmissionService {
    @inject(ILogger) @named('yukibana:SubmissionService') protected readonly logger!: ILogger;

    private async loadGitignores(root: string): Promise<Map<string, Ignore>> {
        const files = await fg('**/.gitignore', {
            cwd: root,
            dot: true,
            ignore: ['**/node_moules/**', '.git/**'],
        });
        const map = new Map<string, Ignore>();
        for (const f of files) {
            const dir = path.posix.dirname(f);
            const content = await fs.promises.readFile(path.join(root, f), 'utf8');
            map.set(dir === '.' ? '' : dir, ignore().add(content));
        }
        return map;
    }

    private isGitignored(file: string, ignores: Map<string, Ignore>): boolean {
        const parts = file.split('/');
        let ignored = false;
        for (let i = 0; i < parts.length; i++) {
            const dirPath = parts.slice(0, i).join('/');
            const pathInDir = parts.slice(i).join('/');
            const ig = ignores.get(dirPath);
            if (!ig) { continue; }
            const result = ig.test(pathInDir);
            if (result.ignored) {
                ignored = true;
            } else if (result.unignored) {
                ignored = false;
            }
        }
        return ignored;
    }

    private async resolveEntries(options: SubmissionOptions, out?: string): Promise<{ root: string, entries: SubmissionEntry[] }> {
        const root = FileUri.fsPath(options.workspaceUri);
        const files = await this.listFiles(root, options, out);
        const entries = files.map(f => ({
            path: f.path,
            size: f.stats?.size ?? 0,
        }));
        return { root, entries };
    }

    async previewSubmission(options: SubmissionOptions): Promise<SubmissionPreview> {
        const out = !!options.outputUri ? FileUri.fsPath(options.outputUri) : undefined;
        const { entries } = await this.resolveEntries(options, out);
        entries.sort((a, b) => a.path.localeCompare(b.path));
        return {
            entries: entries,
            totalSize: entries.reduce((total, e) => total + e.size, 0),
        };
    }

    async prepareSubmission(options: SubmissionOptions): Promise<{ outputUri: string; fileCount: number; }> {
        const out = !!options.outputUri
            ? FileUri.fsPath(options.outputUri)
            : path.join(os.tmpdir(), `yukibana-${Date.now()}.tar.zst`);

        const { root, entries } = await this.resolveEntries(options, out);
        await this.createArchive(root, out, entries);

        return { outputUri: FileUri.create(out).toString(), fileCount: entries.length };
    }

    protected async listFiles(root: string, options: SubmissionOptions, submissionPath?: string): Promise<Entry[]> {
        let files = await fg(options.include ?? ['**/*'], {
            cwd: root,
            ignore: [
                ...(options.exclude ?? []),
                '**/node_moules/**',
                '.git/**',
                ...(!!submissionPath ? path.relative(root, submissionPath) : []),
            ],
            dot: true,
            onlyFiles: true,
            followSymbolicLinks: false,
            stats: true
        });

        if (options.respectGitignore ?? true) {
            const ignores = await this.loadGitignores(root);
            files = files.filter(f => !this.isGitignored(f.path, ignores));
        }
        return files;
    }

    protected async createArchive(root: string, out: string, entries: SubmissionEntry[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const output = fs.createWriteStream(out);
            const archive = new TarArchive();
            output.on('close', () => resolve());
            archive.on('error', reject);
            archive.pipe(zlib.createZstdCompress()).pipe(output);
            for (const e of entries) {
                archive.file(path.join(root, e.path), { name: e.path });
            }
            archive.finalize();
        });
    }
}
