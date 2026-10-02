/**
 * SPDX-License-Identifier: MIT
 */
import { Disposable, DisposableCollection, Emitter, ILogger, URI } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { loadConfig, YukibanaConfig } from '../../common/yukibana-config';

export const YUKIBANA_CONFIG_FILENAME = 'yukibana.cfg';

/**
 * Provider which handles reading and parsing the config file
 */
@injectable()
export class ConfigProvider implements FrontendApplicationContribution, Disposable {
    protected model: MonacoEditorModel | undefined;
    protected toDispose = new DisposableCollection();

    private readonly onConfigChangeEmitter = new Emitter<YukibanaConfig>();
    readonly onConfigChanged = this.onConfigChangeEmitter.event;

    private _config: YukibanaConfig = loadConfig({});
    private _configURI: URI = new URI(YUKIBANA_CONFIG_FILENAME);

    constructor(
        @inject(MonacoTextModelService) protected readonly textModelService: MonacoTextModelService,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(ILogger) @named('yukibana:ConfigProvider')
        protected readonly logger: ILogger
    ) { }

    async onStart(): Promise<void> {
        const roots = await this.workspaceService.roots;
        const root = roots[0];
        this._configURI = root?.resource.resolve(YUKIBANA_CONFIG_FILENAME);

        const reference = await this.textModelService.createModelReference(this._configURI);
        this.model = reference.object;
        this.toDispose.push(reference);
        this.toDispose.push(Disposable.create(() => this.model = undefined));
        this.readConfiguration();
        this.model.onDidChangeContent(e => this.readConfiguration());
        this._ready.resolve(this._config);
    }

    get ready(): Promise<YukibanaConfig> {
        return this._ready.promise;
    }

    get config(): YukibanaConfig {
        return this._config;
    }

    protected readonly _ready = new Deferred<YukibanaConfig>();

    protected readConfiguration(): void {
        this.logger.debug('Loading configuration');
        if (!this.model || this.model.dirty) {
            return;
        }
        try {
            if (this.model.valid) {
                const content = this.model.getText();
                this._config = this.parseContent(content);
            } else {
                this.logger.debug('Model is invalid');
            }
        } catch (e) {
            this.logger.error(`Failed to load Yukibana configuration from '${this._configURI}': ${e}`, e);
        } finally {
            this.logger.debug('Configuration loaded');
            this.onConfigChangeEmitter.fire(this._config);
        }
    }

    protected parseContent(fileContent: string): YukibanaConfig {
        let data;
        try {
            data = JSON.parse(fileContent);
        } catch (e) {
            throw new Error(`Malformed JSON: ${e}`);
        }
        return loadConfig(data);
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
