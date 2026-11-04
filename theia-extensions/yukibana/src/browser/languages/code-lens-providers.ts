/**
 * SPDX-License-Identifier: MIT
 */
import { injectable } from '@theia/core/shared/inversify';
import { YukibanaConfig } from '../../common/yukibana-config';
import { LanguageProviderToggleContribution } from './provider-toggle';

@injectable()
export class CodeLensToggleContribution extends LanguageProviderToggleContribution {
    protected readonly registerFunction = 'registerCodeLensProvider';
    protected isEnabled(config: YukibanaConfig): boolean {
        return config.features.codeLenses;
    }
}
