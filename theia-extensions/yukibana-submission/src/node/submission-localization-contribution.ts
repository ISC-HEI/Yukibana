/**
 * SPDX-License-Identifier: MIT
 */
import { LocalizationContribution, LocalizationRegistry } from '@theia/core/lib/node/i18n/localization-contribution';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class YukibanaSubmissionLocalizationContribution implements LocalizationContribution {
    async registerLocalizations(registry: LocalizationRegistry): Promise<void> {
        registry.registerLocalizationFromRequire('fr', require('../../i18n/nls.fr.json'));
    }
}
