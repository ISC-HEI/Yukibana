/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger, URI } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import {
    createFileSystemProviderError,
    FileDeleteOptions,
    FileOverwriteOptions,
    FilePermission,
    FileSystemProviderErrorCode,
    FileWriteOptions,
    Stat
} from '@theia/filesystem/lib/common/files';
import { RemoteFileSystemProvider } from '@theia/filesystem/lib/common/remote-file-system-provider';
import { ReadOnlyPolicy } from './config/read-only-policy';

@injectable()
export class YukibanaRemoteFileSystemProvider extends RemoteFileSystemProvider {
    @inject(ReadOnlyPolicy) protected readonly readOnlyPolicy!: ReadOnlyPolicy;
    @inject(ILogger) @named('yukibana:RemoteFileSystemProvider') protected readonly logger!: ILogger;

    protected override init(): void {
        super.init();
        this.logger.info('Initialized');
    }

    protected isFileReadonly(resource: URI): boolean {
        return this.readOnlyPolicy.isFileReadonly(resource);
    }

    assertWritable(resource: URI): void {
        if (this.isFileReadonly(resource)) {
            throw createFileSystemProviderError(`"${resource.path.base}" cannot be modified`, FileSystemProviderErrorCode.NoPermissions);
        }
    }

    override async stat(resource: URI): Promise<Stat> {
        const stat = await super.stat(resource);
        return this.isFileReadonly(resource)
            ? { ...stat, permissions: FilePermission.Readonly }
            : stat;
    }

    override async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        this.assertWritable(resource);
        return super.writeFile(resource, content, opts);
    }

    override async delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
        this.assertWritable(resource);
        return super.delete(resource, opts);
    }

    override async rename(resource: URI, target: URI, opts: FileOverwriteOptions): Promise<void> {
        this.assertWritable(resource);
        this.assertWritable(target);
        return super.rename(resource, target, opts);
    }
}
