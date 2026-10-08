/**
 * SPDX-License-Identifier: MIT
 */
import { Emitter, Event } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ConfigProvider } from '../config/config-provider';

@injectable()
export class AssignmentResolver {
    @inject(WorkspaceService) protected readonly workspace!: WorkspaceService;
    @inject(ConfigProvider) protected readonly configProvider!: ConfigProvider;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        this.workspace.onWorkspaceChanged(() => this.onDidChangeEmitter.fire());
        this.configProvider.onConfigChanged(() => this.onDidChangeEmitter.fire());
    }

    async resolve(): Promise<URI | undefined> {
        const root = this.workspace.tryGetRoots()[0]?.resource;
        if (!root) {
            return undefined;
        }
        const name = this.configProvider.config.assignmentFile;
        return root.resolve(name);
    }
}
