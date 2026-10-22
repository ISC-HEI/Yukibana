/**
 * SPDX-License-Identifier: MIT
 */
import { nls } from '@theia/core';
import { escapeMarkdownSyntaxTokens } from '@theia/core/lib/common/markdown-rendering/markdown-string';

/**
 * `nls.localize` producing markdown: the template is markdown, and each argument is plain text that renders literally.
 *
 * @param key identifies the template in the translation files (`i18n/nls.*.json`), e.g. `yukibana/cloud/loginFailed`.
 * @param defaultTemplate the template used when the current language has no translation for `key`;
 *     `{0}`, `{1}`, ... are replaced by `args`.
 */
export function localizeMarkdown(key: string, defaultTemplate: string, ...args: string[]): string {
    return nls.localize(key, defaultTemplate, ...args.map(escapeMarkdownSyntaxTokens));
}
