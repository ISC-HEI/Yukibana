/**
 * SPDX-License-Identifier: MIT
 */

import { ILogger } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { ProblemContribution } from '@theia/markers/lib/browser/problem/problem-contribution';
import { ProblemStat } from '@theia/markers/lib/browser/problem/problem-manager';
import { ConfigProvider } from './config/config-provider';

@injectable()
export class YukibanaProblemContributioun extends ProblemContribution {
    @inject(ConfigProvider) protected readonly configProvider: ConfigProvider;
    @inject(ILogger) @named('yukibana:ProblemContribution') protected readonly logger: ILogger;

    @postConstruct()
    init(): void {
        this.configProvider.onConfigChanged(e => this.updateStatusBarElement());
    }

    protected setStatusBarElement(problemStat: ProblemStat): void {
        if (this.configProvider.config.features.squiggles === false) {
            this.statusBar.removeElement('problem-marker-status');
            return;
        }
        super.setStatusBarElement(problemStat);
    }
}
