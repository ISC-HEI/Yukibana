/**
 * SPDX-License-Identifier: MIT
 */
import { z, ZodError } from 'zod';

const ConfigSchema = z.object({
    features: z.object({
        codeSuggestions: z.boolean().default(true).optional(),
        squiggles: z.boolean().default(true).optional(),
    })
});

export type YukibanaConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(raw: string): YukibanaConfig {
    const data = JSON.parse(raw);
    try {
        return ConfigSchema.parse(data);
    } catch (e) {
        if (e instanceof ZodError) {
            throw new Error(`Invalid format: ${JSON.stringify(e.issues, undefined, 2)} got ${raw}`);
        }
        throw e;
    }
}
