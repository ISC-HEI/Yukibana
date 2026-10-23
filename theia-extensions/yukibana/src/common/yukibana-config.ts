/**
 * SPDX-License-Identifier: MIT
 */
import { DEFAULT_SETTINGS, parseSettings, Settings } from '@yukibana/cli/config';

/**
 * What a workspace is set up with: its `yukibana.json`, read with the schema the CLI checks a release with, so the IDE
 * and the CLI cannot read a field differently.
 */
export type YukibanaConfig = Settings;

/** What a workspace without a `yukibana.json`, or with one that is not valid, is set up with. */
export const DEFAULT_CONFIG: YukibanaConfig = DEFAULT_SETTINGS;

/**
 * Returns the settings in `text`, a `yukibana.json`, with defaults for what it leaves out.
 *
 * Throws an error naming the field when `text` is not valid; a file without `version` or `kind` is valid here, since
 * the IDE opens any folder.
 */
export function loadConfig(text: string): YukibanaConfig {
    const parsed = parseSettings(text);
    if (!parsed.ok) {
        throw new Error(parsed.error);
    }
    return parsed.settings;
}
