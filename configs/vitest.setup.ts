/**
 * SPDX-License-Identifier: MIT
 *
 * Runs in every Vitest worker before a spec file is loaded.
 */
import { createRequire, registerHooks, type LoadFnOutput } from 'node:module';

// Theia's packages are CommonJS and load through Node, outside Vite's
// pipeline, so their `require('./style.css')` calls need ignoring there.
createRequire(import.meta.url)('ignore-styles');

// The same for ESM imports of styles, e.g. in @theia/monaco-editor-core.
const STYLE_EXTENSIONS = ['.css', '.scss', '.sass', '.less'];
registerHooks({
    load(url, context, nextLoad): LoadFnOutput {
        if (STYLE_EXTENSIONS.some(ext => url.endsWith(ext))) {
            return { format: 'module', source: 'export default {};', shortCircuit: true };
        }
        return nextLoad(url, context);
    }
});

// '@lumino/dragdrop' needs DragEvent as soon as it is loaded.
(globalThis as { DragEvent?: unknown }).DragEvent ??= class DragEvent { };

// For the specs that run in the jsdom environment (`// @vitest-environment
// jsdom`), what Theia's frontend modules expect when they are loaded: what
// Theia's own enableJSDOM() adds to JSDOM, and an application config.
if (typeof document !== 'undefined') {
    (document as { queryCommandSupported?: () => boolean }).queryCommandSupported ??= () => false;
    const { FrontendApplicationConfigProvider } = await import('@theia/core/lib/browser/frontend-application-config-provider');
    FrontendApplicationConfigProvider.set({});
}
