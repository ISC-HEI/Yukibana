/**
 * SPDX-License-Identifier: MIT
 */
import { z } from 'zod';

const ConfigSchema = z.object({
    features: z.object({
        codeSuggestions: z.boolean().default(true),
        squiggles: z.boolean().default(true),
    }).prefault({}),
    layout: z.object({
        widgets: z.object({
            files: z.boolean().default(true),
            search: z.boolean().default(true),
            vcs: z.boolean().default(true),
            debug: z.boolean().default(true),
            testing: z.boolean().default(true),
            outline: z.boolean().default(true),
        }).prefault({}),
        containers: z.record(z.string(), z.boolean()).default({}),
        views: z.record(z.string(), z.boolean()).default({}),
    }).prefault({})
}).prefault({});

export type YukibanaConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(raw: string): YukibanaConfig {
    let data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        throw new Error(`Malformed JSON: ${e}`);
    }
    try {
        return ConfigSchema.parse(data);
    } catch (e) {
        if (e instanceof z.ZodError) {
            throw new Error(`Invalid format: ${z.prettifyError(e)} got ${raw}`);
        }
        throw e;
    }
}
