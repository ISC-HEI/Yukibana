/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger, URI } from '@theia/core';
import { Iterators } from '@theia/core/lib/browser';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { Diagnostic } from '@theia/core/shared/vscode-languageserver-protocol';
import { MarkerCollection, SearchFilter } from '@theia/markers/lib/browser/marker-manager';
import { ProblemManager, ProblemStat } from '@theia/markers/lib/browser/problem/problem-manager';
import { ConfigProvider } from './config/config-provider';
import { Marker } from '@theia/markers/lib/common/marker';

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
        configProvider.onConfigChanged(e => this.onConfigChanged());
        configProvider.ready.then(config => {
            logger.info(`${(config.features.squiggles !== false) ? 'Enabling' : 'Disabling'} problem markers`);
        });
    }

    get isEnabled(): boolean {
        return this.configProvider.config.features.squiggles !== false;
    }

    protected onConfigChanged(): void {
        for (const uri of super.getUris()) {
            this.fireOnDidChangeMarkers(new URI(uri));
        }
    }

    override getMarkersByUri(): IterableIterator<[string, MarkerCollection<Diagnostic>]> {
        if (!this.isEnabled) {
            return Iterators.asIterator([]);
        }
        return super.getMarkersByUri();
    }

    override getUris(): IterableIterator<string> {
        if (!this.isEnabled) {
            return Iterators.asIterator([]);
        }
        return super.getUris();
    }

    override getProblemStat(): ProblemStat {
        if (!this.isEnabled) {
            return {
                errors: 0,
                warnings: 0,
                infos: 0,
            };
        }
        return super.getProblemStat();
    }

    override findMarkers(filter?: SearchFilter<Diagnostic> | undefined): Marker<Diagnostic>[] {
        if (!this.isEnabled) {
            return [];
        }
        return super.findMarkers(filter);
    }
}
