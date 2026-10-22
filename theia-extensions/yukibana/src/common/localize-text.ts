/**
 * SPDX-License-Identifier: MIT
 */
import { nls } from '@theia/core';
import { escapeMarkdownSyntaxTokens } from '@theia/core/lib/common/markdown-rendering/markdown-string';

/**
 * `nls.localize` for text shown through `MessageService`. Theia renders notifications as markdown, with
 * `command:` links clickable, so an argument such as a server's error reason containing `[x](command:...)`
 * would turn into a link that runs a command. The template keeps its markdown; the arguments have theirs escaped.
 */
export function localizeText(key: string, defaultValue: string, ...args: string[]): string {
    return nls.localize(key, defaultValue, ...args.map(escapeMarkdownSyntaxTokens));
}
