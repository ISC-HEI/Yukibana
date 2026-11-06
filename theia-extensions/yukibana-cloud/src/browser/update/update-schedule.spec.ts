/**
 * SPDX-License-Identifier: MIT
 */
import { expect } from 'chai';
import { describe, it } from 'vitest';
import { nextCheckIn, POLL_MS, POLL_NEAR_DEADLINE_MS } from './update-schedule';

const NOW = Date.parse('2026-11-06T10:00:00Z');
const MIN = 60 * 1000;

describe('How often the IDE checks for a newer version of the assignment', () => {
    it('checks every five minutes when the project has no deadline', () => {
        expect(nextCheckIn(NOW, undefined)).to.equal(POLL_MS);
    });

    it('checks every five minutes while the deadline is far away', () => {
        expect(nextCheckIn(NOW, '2026-11-08T10:00:00Z')).to.equal(POLL_MS);
    });

    it('checks every minute in the last two hours before the deadline', () => {
        expect(nextCheckIn(NOW, '2026-11-06T12:00:00Z')).to.equal(POLL_NEAR_DEADLINE_MS);
        expect(nextCheckIn(NOW, '2026-11-06T10:00:30Z')).to.equal(POLL_NEAR_DEADLINE_MS);
    });

    it('starts checking every minute on time, not up to five minutes late', () => {
        expect(nextCheckIn(NOW, '2026-11-06T12:02:00Z')).to.equal(2 * MIN);
    });

    it('goes back to every five minutes once the deadline has passed', () => {
        expect(nextCheckIn(NOW, '2026-11-06T09:59:00Z')).to.equal(POLL_MS);
    });

    it('checks every five minutes when the deadline cannot be read', () => {
        expect(nextCheckIn(NOW, 'soon')).to.equal(POLL_MS);
    });
});
