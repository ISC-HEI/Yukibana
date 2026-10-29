/**
 * SPDX-License-Identifier: MIT
 */
import { TheiaApp, TheiaExplorerView, TheiaView } from '@theia/playwright';

/** Theia's explorer view, finding nodes by an `[id="..."]` selector, which works for any path. */
export class PatchedTheiaExplorerView extends TheiaExplorerView {
    /** Returns a selector of the explorer node of `filePath`. */
    protected treeNodeSelector(filePath: string): string {
        return `.theia-FileStatNode:has([id="${this.treeNodeId(filePath).replaceAll('"', '\\"')}"])`;
    }
}

/** A view class. */
interface ViewFactory<T extends TheiaView> {
    new (app: TheiaApp): T;
}

/** Theia's app, opening `PatchedTheiaExplorerView` for the explorer. */
export class PatchedTheiaApp extends TheiaApp {
    /** The view class to open instead of each one. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly viewOverrides = new Map<ViewFactory<any>, ViewFactory<any>>([[TheiaExplorerView, PatchedTheiaExplorerView]]);

    /** Opens a `viewFactory` view, or its override, and returns it. */
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
