/**
 * SPDX-License-Identifier: MIT
 */
import { z } from 'zod';

// TODO: extract constant strings
const ConfigSchema = z.object({
    assignmentFile: z.string().default('ASSIGNMENT.md'),
    features: z.object({
        codeSuggestions: z.boolean().default(true),
        squiggles: z.boolean().default(true),
        ai: z.boolean().default(true),
    }).prefault({}),
    layout: z.object({
        widgets: z.object({
            files: z.boolean().default(true),
            search: z.boolean().default(true),
            vcs: z.boolean().default(true),
            debug: z.boolean().default(true),
            testing: z.boolean().default(true),
            outline: z.boolean().default(true),
            aiChat: z.boolean().default(true),
        }).prefault({}),
        containers: z.record(z.string(), z.boolean()).default({}),
        views: z.record(z.string(), z.boolean()).default({}),
    }).prefault({}),
    openFiles: z.array(z.string()).default([]),
    readOnly: z.array(z.string()).default([]),
    submission: z.object({
        include: z.array(z.string()).optional(),
        exclude: z.array(z.string()).optional(),
        respectGitignore: z.boolean().default(true),
        filename: z.string().default('submission.zip')
    }).prefault({})
}).prefault({});

export type YukibanaConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(raw: object): YukibanaConfig {
    try {
        return ConfigSchema.parse(raw);
    } catch (e) {
        if (e instanceof z.ZodError) {
            throw new Error(`Invalid format: ${z.prettifyError(e)} got ${raw}`);
        }
        throw e;
    }
}

export function getJSONSchema(): object {
    return z.toJSONSchema(ConfigSchema, {
        io: 'input',
    });
}
