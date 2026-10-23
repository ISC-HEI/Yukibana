/**
 * This file can be edited to adjust the ESBuild build process.
 * To reset, delete this file and rerun theia build again.
 */
import { browserOptions, watch } from './gen-esbuild.browser.mjs';
import { nodeOptions } from './gen-esbuild.node.mjs';
import { electronOptions } from './gen-esbuild.electron.mjs';
import esbuild from 'esbuild';

const browserContext = await esbuild.context(browserOptions);
const nodeContext = await esbuild.context(nodeOptions);
const electronContext = await esbuild.context(electronOptions);

if (watch) {
    await Promise.all([
        browserContext.watch(),
        nodeContext.watch(),
        electronContext.watch(),
    ]);
} else {
    try {
        // The backend build is independent, so it runs at the same time. The browser and electron builds both write
        // to lib/frontend, where each rewrites every source map when it ends, so they run one after the other.
        await Promise.all([browserContext.rebuild().then(() => electronContext.rebuild()), nodeContext.rebuild()]);
        await Promise.all([browserContext.dispose(), nodeContext.dispose(), electronContext.dispose()]);
    } catch {
        process.exit(1);
    }
}
