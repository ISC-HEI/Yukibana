/**
 * SPDX-License-Identifier: MIT
 */
import { DisposableCollection, Emitter, ILogger, URI } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { loadConfig, YukibanaConfig } from '../../common/yukibana-config';
import { ReadOnlyPolicy } from './read-only-policy';

export const YUKIBANA_CONFIG_FILENAME = 'yukibana.json';

/**
 * Provider which handles reading and parsing the config file
 */
@injectable()
export class ConfigProvider implements FrontendApplicationContribution {
    protected readonly toDisposeOnWorkspaceChanged = new DisposableCollection();
    private readonly onConfigChangeEmitter = new Emitter<YukibanaConfig>();
    readonly onConfigChanged = this.onConfigChangeEmitter.event;

    private _config: YukibanaConfig = loadConfig({});
    private _configURI: URI = new URI(YUKIBANA_CONFIG_FILENAME);

    constructor(
        @inject(FileService) protected readonly files: FileService,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(ReadOnlyPolicy) protected readonly readOnlyPolicy: ReadOnlyPolicy,
        @inject(ILogger) @named('yukibana:ConfigProvider')
        protected readonly logger: ILogger
    ) { }

    async onStart(): Promise<void> {
        await this.workspaceService.ready;
        await this.reload();
        this.workspaceService.onWorkspaceChanged(() => this.reload());
    }

    protected async reload(): Promise<void> {
        this.toDisposeOnWorkspaceChanged.dispose();
        const root = this.workspaceService.tryGetRoots()[0]?.resource;
        if (!root) {
            this.applyDefault();
            return;
        }
        this._configURI = root.resolve(YUKIBANA_CONFIG_FILENAME);
        if (!await this.files.exists(this._configURI)) {
            this.applyDefault();
            return;
        }
        const read = async () => {
            try {
                const { value } = await this.files.read(this._configURI);
                this.apply(root, loadConfig(JSON.parse(value)));
            } catch (e) {
                this.logger.error(`Failed to load Yukibana configuration from '${this._configURI}: ${e}`, e);
                this.applyDefault();
            }
        };
        this.toDisposeOnWorkspaceChanged.push(this.files.watch(this._configURI));
        this.toDisposeOnWorkspaceChanged.push(
            this.files.onDidFilesChange(e => {
                if (e.contains(this._configURI)) {
                    read();
                }
            })
        );
        await read();
    }

    get ready(): Promise<YukibanaConfig> {
        return this._ready.promise;
    }

    get config(): YukibanaConfig {
        return this._config;
    }

    protected readonly _ready = new Deferred<YukibanaConfig>();

    protected applyDefault(): void {
        this.apply(undefined, loadConfig({}));
    }

    protected apply(root: URI | undefined, config: YukibanaConfig): void {
        this._config = config;
        this.readOnlyPolicy.update(root, config.readOnly);
        this.logger.info('Configuration loaded');
        this.onConfigChangeEmitter.fire(config);
        this._ready.resolve(this._config);
    }
}
