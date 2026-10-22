/**
 * SPDX-License-Identifier: MIT
 */
import { nls } from '@theia/core';
import { escapeMarkdownSyntaxTokens } from '@theia/core/lib/common/markdown-rendering/markdown-string';

/**
 * `nls.localize` producing markdown: the template is markdown, and each argument is plain text that renders literally.
 */
export function localizeMarkdown(key: string, defaultValue: string, ...args: string[]): string {
    return nls.localize(key, defaultValue, ...args.map(escapeMarkdownSyntaxTokens));
}
