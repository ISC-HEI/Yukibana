/**
 * SPDX-License-Identifier: MIT
 */
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getJSONSchema } from '../theia-extensions/yukibana/src/common/yukibana-config.ts';
import * as fs from 'fs';

/** The command line's options. */
const argv = yargs(hideBin(process.argv))
    .option('output', {
        alias: 'o',
        type: 'string',
        default: 'config_schema.json',
        description: 'The path where the schema will be saved',
    })
    .version(false)
    .wrap(120)
    .parseSync();

execute();

/** Writes the JSON schema of Yukibana's configuration to the `--output` file. */
async function execute(): Promise<void> {
    const output = argv.output;
    const schema = getJSONSchema();
    fs.writeFileSync(output, JSON.stringify(schema, undefined, 2));
}
