/**
 * SPDX-License-Identifier: MIT
 */
import { nls } from '@theia/core';
import { escapeMarkdownSyntaxTokens } from '@theia/core/lib/common/markdown-rendering/markdown-string';

/**
 * `nls.localize` for messages, which MessageService renders as markdown, `command:` links included:
 * the template keeps its markdown, the arguments are text from elsewhere and have theirs escaped.
 */
export function localizeText(key: string, defaultValue: string, ...args: string[]): string {
    return nls.localize(key, defaultValue, ...args.map(escapeMarkdownSyntaxTokens));
}
