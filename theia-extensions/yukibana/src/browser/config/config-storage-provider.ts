/**
 * SPDX-License-Identifier: MIT
 */
import { Disposable, DisposableCollection, ILogger, URI } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { loadConfig, YukibanaConfig } from '../../common/yukibana-config';
import { DEFAULT_YUKIBANA_CONFIG, UserConfigURI } from './config-constants';

/**
 * Provider which handles reading and parsing the config file
 */
@injectable()
export class ConfigStorageProvider implements Disposable {
    protected model: MonacoEditorModel | undefined;
    protected toDispose = new DisposableCollection();

    protected _config: YukibanaConfig | undefined;

    constructor(
        @inject(MonacoTextModelService) protected readonly textModelService: MonacoTextModelService,
        @inject(UserConfigURI) protected readonly USER_CONFIG_URI: URI,
        @inject(ILogger) @named('yukibana:ConfigProvider')
        protected readonly logger: ILogger
    ) { }

    get ready(): Promise<YukibanaConfig> {
        return this._ready.promise;
    }

    get config(): YukibanaConfig | undefined {
        return this._config;
    }

    protected readonly _ready = new Deferred<YukibanaConfig>();

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        const reference = await this.textModelService.createModelReference(this.USER_CONFIG_URI);
        this.model = reference.object;
        this.toDispose.push(reference);
        this.toDispose.push(Disposable.create(() => this.model = undefined));
        this.readConfiguration();
        if (!this._config) {
            this.logger.debug('No config provided, using default');
        }
        this._ready.resolve(this._config ?? DEFAULT_YUKIBANA_CONFIG);
    }

    protected readConfiguration(): void {
        if (!this.model || this.model.dirty) {
            return;
        }
        try {
            if (this.model.valid) {
                const content = this.model.getText();
                this._config = this.parseContent(content);
            } else {
                this.logger.debug('Model is invalid');
                this._config = undefined;
            }
        } catch (e) {
            this.logger.error(`Failed to load Yukibana configuration from '${this.USER_CONFIG_URI}'.`, e);
        }
    }

    protected parseContent(fileContent: string): YukibanaConfig | undefined {
        return loadConfig(fileContent);
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
