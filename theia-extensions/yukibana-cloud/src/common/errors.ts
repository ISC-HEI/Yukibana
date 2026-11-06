/**
 * SPDX-License-Identifier: MIT
 */

/** Returns the sentence that `e`, something thrown, says about what went wrong. */
export function messageOf(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
