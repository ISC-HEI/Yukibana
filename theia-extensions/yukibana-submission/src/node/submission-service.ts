/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger } from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ZipArchive } from 'archiver';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SubmissionOptions, SubmissionService } from './submission-protocol';
const fg = require('fast-glob');

@injectable()
export class SubmissionServiceImpl implements SubmissionService {
    @inject(ILogger) @named('yukibana:SubmissionService') protected readonly logger!: ILogger;

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
        return fg(options.include ?? ['** /* '], {
            cwd: root,
            ignore: [
                ...(options.exclude ?? []),
                path.relative(root, submissionPath),
            ],
            dot: true,
            onlyFiles: true,
            followSymbolicLinks: false,
        });
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
