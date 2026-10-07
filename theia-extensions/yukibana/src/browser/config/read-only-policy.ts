/**
 * SPDX-License-Identifier: MIT
 */
import { URI } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { match } from '@theia/monaco-editor-core/esm/vs/base/common/glob';

@injectable()
export class ReadOnlyPolicy {
    protected root?: URI;
    protected patterns: Record<string, boolean> = {};

    update(root: URI | undefined, readOnly: string[]): void {
        this.root = root;
        this.patterns = Object.fromEntries(readOnly.map(p => [p, true]));
    }

    isFileReadonly(resource: URI): boolean {
        if (!this.root) {
            return false;
        }
        const rel = this.root.relative(resource);
        return !!rel && match(this.patterns, rel.toString());
    }
}
