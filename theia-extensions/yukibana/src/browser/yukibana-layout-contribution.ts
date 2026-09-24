/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger } from '@theia/core';
import { FrontendApplication, FrontendApplicationContribution, ShellLayoutRestorer, StorageService, WidgetManager } from '@theia/core/lib/browser';
import { inject, injectable, interfaces, named } from '@theia/core/shared/inversify';
import { SearchInWorkspaceFrontendContribution } from '@theia/search-in-workspace/lib/browser/search-in-workspace-frontend-contribution';
import { ConfigProvider } from './config/config-provider';
import { OverrideSearchInWorkspaceFrontendContribution } from './layout/search';

@injectable()
export class YukibanaLayoutRestorer extends ShellLayoutRestorer {
    constructor(
        @inject(WidgetManager) widgetManager: WidgetManager,
        @inject(ILogger) @named('yukibana:LayoutRestorer') logger: ILogger,
        @inject(StorageService) storageService: StorageService,
    ) {
        super(widgetManager, logger, storageService);
    }
    override async restoreLayout(app: FrontendApplication): Promise<boolean> {
        this.logger.debug('Prevent restoring layout');
        return false;
    }
    override async storeLayout(app: FrontendApplication): Promise<void> {
        this.logger.debug('Prevent saving layout');
    }
}

@injectable()
export class YukibanaLayoutContribution implements FrontendApplicationContribution {
    constructor(
        @inject(WidgetManager) protected readonly widgets: WidgetManager,
        @inject(ConfigProvider) protected readonly configProvider: ConfigProvider,
        @inject(ILogger) @named('yukibana:LayoutContribution') protected readonly logger: ILogger,
    ) { }

    async initializeLayout(app: FrontendApplication): Promise<void> {
        this.logger.debug('Initializing layout');
    }
}

export function bindLayout(bind: interfaces.Bind, rebind: interfaces.Rebind): void {
    bind(YukibanaLayoutContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(YukibanaLayoutContribution);
    rebind(ShellLayoutRestorer).to(YukibanaLayoutRestorer).inSingletonScope();

    rebind(SearchInWorkspaceFrontendContribution).to(OverrideSearchInWorkspaceFrontendContribution).inSingletonScope();
}
