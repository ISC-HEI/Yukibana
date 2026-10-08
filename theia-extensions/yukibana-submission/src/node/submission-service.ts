/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger } from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ZipArchive } from 'archiver';
import * as fs from 'fs';
import ignore, { Ignore } from 'ignore';
import * as os from 'os';
import * as path from 'path';
import { SubmissionOptions, SubmissionService } from './submission-protocol';
const fg = require('fast-glob');

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

    async prepareSubmission(options: SubmissionOptions): Promise<{ outputUri: string; fileCount: number; }> {
        const root = FileUri.fsPath(options.workspaceUri);
        const out = !!options.outputUri
            ? FileUri.fsPath(options.outputUri)
            : path.join(os.tmpdir(), `yukibana-${Date.now()}.zip`);
        const files = await this.listFiles(root, out, options);

        await this.createArchive(root, out, files);

        return { outputUri: FileUri.create(out).toString(), fileCount: files.length };
    }

    protected async listFiles(root: string, submissionPath: string, options: SubmissionOptions): Promise<string[]> {
        let files: string[] = await fg(options.include ?? ['**/*'], {
            cwd: root,
            ignore: [
                ...(options.exclude ?? []),
                '**/node_moules/**',
                '.git/**',
                path.relative(root, submissionPath),
            ],
            dot: true,
            onlyFiles: true,
            followSymbolicLinks: false,
        });

        if (options.respectGitignore ?? true) {
            const ignores = await this.loadGitignores(root);
            files = files.filter(f => !this.isGitignored(f, ignores));
        }
        return files;
    }

    protected async createArchive(root: string, out: string, files: string[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const output = fs.createWriteStream(out);
            const archive = new ZipArchive();
            output.on('close', () => resolve());
            archive.on('error', reject);
            archive.pipe(output);
            for (const f of files) {
                archive.file(path.join(root, f), { name: f });
            }
            archive.finalize();
        });
    }
}
