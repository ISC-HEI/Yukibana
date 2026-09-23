/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger, URI } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { Diagnostic } from '@theia/core/shared/vscode-languageserver-protocol';
import { ProblemManager } from '@theia/markers/lib/browser/problem/problem-manager';
import { Marker } from '@theia/markers/lib/common/marker';
import { ConfigProvider } from './config/config-provider';

/**
 * Contribution which manages diagnostics
 */
@injectable()
export class YukibanaProblemManager extends ProblemManager {
    constructor(
        @inject(ConfigProvider) protected readonly configProvider: ConfigProvider,
        @inject(ILogger) @named("yukibana:ProblemManager") protected readonly logger: ILogger
    ) {
        super();
        configProvider.ready.then(config => {
            logger.info(`${(config.features.squiggles !== false) ? 'Enabling' : 'Disabling'} problem markers`);
        });
    }

    override setMarkers(uri: URI, owner: string, data: Diagnostic[]): Marker<Diagnostic>[] {
        const enabled = this.configProvider.config.features.squiggles !== false;
        if (!enabled) {
            data = [];
        }
        return super.setMarkers(uri, owner, data);
    }
}
