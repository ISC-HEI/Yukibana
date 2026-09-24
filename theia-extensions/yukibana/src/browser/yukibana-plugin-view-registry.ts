/**
 * SPDX-License-Identifier: MIT
 */
import { Disposable } from '@theia/core';
import { inject } from '@theia/core/shared/inversify';
import { View, ViewContainer } from '@theia/plugin-ext';
import { PluginViewRegistry } from '@theia/plugin-ext/lib/main/browser/view/plugin-view-registry';
import { ConfigProvider } from './config/config-provider';

export class YukibanaPluginViewRegistry extends PluginViewRegistry {
    @inject(ConfigProvider) protected readonly configProvider: ConfigProvider;

    protected isContainerEnabled(containerId: string): boolean {
        return this.configProvider.config.layout.containers[containerId] ?? true;
    }

    protected isViewEnabled(viewId: string): boolean {
        return this.configProvider.config.layout.views[viewId] ?? true;
    }

    registerViewContainer(location: string, viewContainer: ViewContainer): Disposable {
        if (!this.isContainerEnabled(viewContainer.id)) {
            return Disposable.NULL;
        }
        return super.registerViewContainer(location, viewContainer);
    }

    registerView(viewContainerId: string, view: View): Disposable {
        if (!this.isContainerEnabled(viewContainerId) || !this.isViewEnabled(view.id)) {
            return Disposable.NULL;
        }
        return super.registerView(viewContainerId, view);
    }
}
