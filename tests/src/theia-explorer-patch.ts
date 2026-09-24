/**
 * SPDX-License-Identifier: MIT
 */
import { TheiaApp, TheiaExplorerView, TheiaView } from "@theia/playwright";

export class PatchedTheiaExplorerView extends TheiaExplorerView {
    protected treeNodeSelector(filePath: string): string {
        return `.theia-FileStatNode:has([id="${this.treeNodeId(filePath).replace('"', '\\"')}"])`;
    }
}

interface ViewFactory<T extends TheiaView> {new(app: TheiaApp): T}

/**
 * Patched TheiaApp to correctly handle paths in CSS selectors for the explorer
 */
export class PatchedTheiaApp extends TheiaApp {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly viewOverrides = new Map<ViewFactory<any>, ViewFactory<any>>([
        [TheiaExplorerView, PatchedTheiaExplorerView],
    ]);

    async openView<T extends TheiaView>(viewFactory: ViewFactory<T>): Promise<T> {
        const factory = (this.viewOverrides.get(viewFactory) ?? viewFactory) as ViewFactory<T>;
        const view = new factory(this);
        if (await view.isTabVisible()) {
            await view.activate();
            return view;
        }
        await view.open();
        return view;
    }
}
