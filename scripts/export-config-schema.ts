/**
 * SPDX-License-Identifier: MIT
 */
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getJSONSchema } from '../theia-extensions/yukibana/src/common/yukibana-config';
import * as fs from 'fs';

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

async function execute(): Promise<void> {
    const output = argv.output;
    const schema = getJSONSchema();
    fs.writeFileSync(output, JSON.stringify(schema, undefined, 2));
}
