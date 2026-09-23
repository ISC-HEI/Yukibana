/**
 * SPDX-License-Identifier: MIT
 */
import { Disposable, ILogger, MaybePromise } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';
import { YukibanaConfig } from '../common/yukibana-config';
import { ConfigStorageProvider } from './config/config-storage-provider';

/**
 * Contribution which manages registration of completion providers (inline suggestions)
 */
@injectable()
export class SuggestionsContribution implements FrontendApplicationContribution {
    constructor(
        @inject(ConfigStorageProvider) protected readonly configProvider: ConfigStorageProvider,
        @inject(ILogger) @named('yukibana:SuggestioisContribution') protected readonly logger: ILogger
    ) { }

    private _pending: Array<{ selector: monaco.languages.LanguageSelector; provider: monaco.languages.CompletionItemProvider, disposable: Disposable }> = [];
    private _originalRegister = monaco.languages.registerCompletionItemProvider;

    initialize(): MaybePromise<void> {
        monaco.languages.registerCompletionItemProvider = (selector, provider) => {
            const disposable = ({ dispose: () => { } });
            this._pending.push({ selector, provider, disposable });
            return disposable;
        };
        this.configProvider.ready.then(config => this.flush(config));
    }

    /**
     * Flushes pending provider registrations if suggestions are enabled,
     * or cancel them and replace register function with dummy
     * @param config the Yukibana configuration
     */
    private flush(config: YukibanaConfig): void {
        if (config.features.codeSuggestions === false) {
            this.logger.info('Disabling completion item providers');
            monaco.languages.registerCompletionItemProvider = (selector, provider) => Disposable.NULL;
        } else {
            this.logger.info('Enabling completion item providers');
            monaco.languages.registerCompletionItemProvider = this._originalRegister;
            for (const { selector, provider, disposable } of this._pending) {
                const newDisposable = this._originalRegister(selector, provider);
                disposable.dispose = newDisposable.dispose;
            }
        }
        this._pending = [];
    }
}
