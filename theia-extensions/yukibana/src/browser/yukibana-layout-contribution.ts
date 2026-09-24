/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger, MaybePromise } from '@theia/core';
import { FrontendApplication, FrontendApplicationContribution, ShellLayoutRestorer, StorageService, WidgetManager } from '@theia/core/lib/browser';
import { inject, injectable, interfaces, named } from '@theia/core/shared/inversify';
import { FileNavigatorContribution } from '@theia/navigator/lib/browser/navigator-contribution';
import { SearchInWorkspaceFrontendContribution } from '@theia/search-in-workspace/lib/browser/search-in-workspace-frontend-contribution';
import { YukibanaConfig } from '../common/yukibana-config';
import { DEFAULT_YUKIBANA_CONFIG } from './config/config-constants';
import { ConfigProvider } from './config/config-provider';

interface WithLayout {
    initializeLayout?(app: FrontendApplication): MaybePromise<void>;
};

type ConfigWidgetKey = keyof typeof DEFAULT_YUKIBANA_CONFIG.layout.widgets;

const TOGGLEABLE_WIDGETS: Array<[interfaces.Newable<WithLayout>, ConfigWidgetKey]> = [
    [FileNavigatorContribution, 'files'],
    [SearchInWorkspaceFrontendContribution, 'search'],
];

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

export function rebindWithLayoutToggle<T extends WithLayout>(rebind: interfaces.Rebind, id: interfaces.Newable<T>, isEnabled: (config: YukibanaConfig) => boolean): void {
    rebind(id)
        .toSelf()
        .inSingletonScope()
        .onActivation(({ container }, contribution) => {
            const configProvider = container.get(ConfigProvider);
            const original = contribution.initializeLayout?.bind(contribution);
            if (!!original) {
                contribution.initializeLayout = async app => {
                    const config = await configProvider.ready;
                    if (isEnabled(config)) {
                        await original(app);
                    }
                };
            }
            return contribution;
        });
}

export function bindLayout(bind: interfaces.Bind, rebind: interfaces.Rebind): void {
    bind(YukibanaLayoutContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(YukibanaLayoutContribution);
    rebind(ShellLayoutRestorer).to(YukibanaLayoutRestorer).inSingletonScope();

    for (const [contribution, widget] of TOGGLEABLE_WIDGETS) {
        rebindWithLayoutToggle(rebind, contribution, config => config.layout.widgets[widget]);
    }
}
