/**
 * SPDX-License-Identifier: MIT
 */
import { FrontendApplication } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { SearchInWorkspaceFrontendContribution } from '@theia/search-in-workspace/lib/browser/search-in-workspace-frontend-contribution';
import { ConfigProvider } from '../config/config-provider';

@injectable()
export class OverrideSearchInWorkspaceFrontendContribution extends SearchInWorkspaceFrontendContribution {
    @inject(ConfigProvider) protected readonly configProvider: ConfigProvider;

    override async initializeLayout(app: FrontendApplication): Promise<void> {
        const config = await this.configProvider.ready;
        if (!config.layout.widgets.search) {
            return;
        }
        await super.initializeLayout(app);
    }
}
