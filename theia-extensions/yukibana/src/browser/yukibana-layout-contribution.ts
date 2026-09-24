/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger, MaybePromise, URI } from '@theia/core';
import { FrontendApplication, FrontendApplicationContribution, OpenerService, ShellLayoutRestorer, StorageService, WidgetManager, WidgetOpenMode } from '@theia/core/lib/browser';
import { inject, injectable, interfaces, named } from '@theia/core/shared/inversify';
import { DebugFrontendApplicationContribution } from '@theia/debug/lib/browser/debug-frontend-application-contribution';
import { EditorManager } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileNavigatorContribution } from '@theia/navigator/lib/browser/navigator-contribution';
import { OutlineViewContribution } from '@theia/outline-view/lib/browser/outline-view-contribution';
import { PluginViewRegistry } from '@theia/plugin-ext/lib/main/browser/view/plugin-view-registry';
import { ScmContribution } from '@theia/scm/lib/browser/scm-contribution';
import { SearchInWorkspaceFrontendContribution } from '@theia/search-in-workspace/lib/browser/search-in-workspace-frontend-contribution';
import { TestViewContribution } from '@theia/test/lib/browser/view/test-view-contribution';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { YukibanaConfig } from '../common/yukibana-config';
import { ConfigProvider } from './config/config-provider';
import { YukibanaPluginViewRegistry } from './yukibana-plugin-view-registry';

interface WithLayout {
    initializeLayout?(app: FrontendApplication): MaybePromise<void>;
};

type ConfigWidgetKey = keyof YukibanaConfig['layout']['widgets'];

const TOGGLEABLE_WIDGETS: Array<[interfaces.ServiceIdentifier<WithLayout>, ConfigWidgetKey]> = [
    [FileNavigatorContribution, 'files'],
    [SearchInWorkspaceFrontendContribution, 'search'],
    [ScmContribution, 'vcs'],
    [DebugFrontendApplicationContribution, 'debug'],
    [TestViewContribution, 'testing'],
    [OutlineViewContribution, 'outline'],
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
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(FileService) protected readonly fileService: FileService,
        @inject(EditorManager) protected readonly editorManager: EditorManager,
    ) { }

    async initializeLayout(app: FrontendApplication): Promise<void> {
        this.logger.debug('Initializing layout');
    }

    async onDidInitializeLayout(app: FrontendApplication): Promise<void> {
        await this.workspaceService.ready;
        const config = await this.configProvider.ready;
        const roots = this.workspaceService.tryGetRoots();
        if (roots.length === 0) {
            return;
        }
        const root = new URI(roots[0].resource.toString());
        await this.openFiles(root, config.openFiles);
    }

    protected async openFiles(root: URI, files: Array<string>): Promise<void> {
        for (const [i, file] of files.entries()) {
            this.openFile(root, file, i === 0 ? 'activate' : 'open');
        }
    }

    protected async openFile(root: URI, file: string, mode: WidgetOpenMode | undefined): Promise<void> {
        await this.doOpenFile(root.resolve(file), mode);
    }

    protected async doOpenFile(file: URI, mode: WidgetOpenMode | undefined): Promise<void> {
        if (await this.fileService.exists(file)) {
            await this.editorManager.open(file, { mode: mode });
        }
    }
}

export function rebindWithLayoutToggle<T extends WithLayout>(
    isBound: interfaces.IsBound,
    rebind: interfaces.Rebind,
    id: interfaces.ServiceIdentifier<T>,
    isEnabled: (config: YukibanaConfig) => boolean
): void {
    if (!isBound(id)) {
        console.log(`rebindWithLayoutToggle: ${String(id)} is not bound`);
        return;
    }
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

export function bindLayout(bind: interfaces.Bind, rebind: interfaces.Rebind, isBound: interfaces.IsBound): void {
    bind(YukibanaLayoutContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(YukibanaLayoutContribution);
    rebind(ShellLayoutRestorer).to(YukibanaLayoutRestorer).inSingletonScope();

    for (const [contribution, widget] of TOGGLEABLE_WIDGETS) {
        rebindWithLayoutToggle(isBound, rebind, contribution, config => config.layout.widgets[widget]);
    }

    rebind(PluginViewRegistry).to(YukibanaPluginViewRegistry).inSingletonScope();
}
