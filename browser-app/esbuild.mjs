/**
 * This file can be edited to adjust the ESBuild build process.
 * To reset, delete this file and rerun theia build again.
 */
import { browserOptions, watch } from './gen-esbuild.browser.mjs';
import { nodeOptions } from './gen-esbuild.node.mjs';

import esbuild from 'esbuild';

/** Build of the frontend, into lib/frontend. */
const browserContext = await esbuild.context(browserOptions);
/** Build of the backend, into lib/backend. */
const nodeContext = await esbuild.context(nodeOptions);


if (watch) {
    await Promise.all([
        browserContext.watch(),
        nodeContext.watch(),
    ]);
} else {
    try {
        // The builds are independent, so run them at the same time.
        await Promise.all([browserContext.rebuild(), nodeContext.rebuild()]);
        await Promise.all([browserContext.dispose(), nodeContext.dispose()]);
    } catch {
        process.exit(1);
    }
}
