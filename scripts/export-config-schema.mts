/**
 * SPDX-License-Identifier: MIT
 *
 * Writes the JSON schema of Yukibana's configuration to config_schema.json, or to the file given with `--output`.
 */
import * as fs from 'node:fs';
import { parseArgs } from 'node:util';
import { getJSONSchema } from '../theia-extensions/yukibana/src/common/yukibana-config.ts';

/** Command line arguments, without the `--` that `pnpm config:schema -- -o <file>` passes through. */
const args = process.argv.slice(2).filter((arg, index) => index > 0 || arg !== '--');
/** The file to write the schema to. */
const { output } = parseArgs({ args, options: { output: { type: 'string', short: 'o', default: 'config_schema.json' } } }).values;

fs.writeFileSync(output, JSON.stringify(getJSONSchema(), undefined, 2));
