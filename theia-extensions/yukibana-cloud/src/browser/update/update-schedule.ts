/**
 * SPDX-License-Identifier: MIT
 */

/** How often the IDE asks whether the teacher published a newer release. */
export const POLL_MS = 5 * 60 * 1000;
/** How often in the last two hours before the deadline, when a fix the teacher publishes matters most. */
export const POLL_NEAR_DEADLINE_MS = 60 * 1000;
/** How long before the deadline the faster polling starts. */
export const NEAR_DEADLINE_MS = 2 * 60 * 60 * 1000;

/**
 * Milliseconds until the next check, after one at `now` (ms since the epoch). `deadline` is the project's, ISO 8601,
 * undefined when it has none or the registry was not reached. Once the deadline has passed the pace is the normal
 * one again; a check is never scheduled past the moment the faster pace starts.
 */
export function nextCheckIn(now: number, deadline: string | undefined): number {
    const due = deadline === undefined ? Number.NaN : Date.parse(deadline);
    if (Number.isNaN(due) || due <= now) {
        return POLL_MS;
    }
    const untilFast = due - NEAR_DEADLINE_MS - now;
    if (untilFast <= 0) {
        return POLL_NEAR_DEADLINE_MS;
    }
    return Math.min(POLL_MS, untilFast);
}
