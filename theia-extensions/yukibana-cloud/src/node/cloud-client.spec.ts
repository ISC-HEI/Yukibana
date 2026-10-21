/**
 * SPDX-License-Identifier: MIT
 */
import { Project } from '@yukibana/cli';
import { expect } from 'chai';
import { CanSubmitStatus } from '../common/cloud-protocol';
import { CloudClient } from './cloud-client';
import { CloudSessionManager } from './cloud-session-manager';

const HOUR = 3600 * 1000;
const at = (offset: number): string => new Date(Date.now() + offset).toISOString();

const open = {
    projectId: 'project', role: 'student', canSubmit: true,
    availableAfter: at(-HOUR), deadline: at(HOUR), closesAt: at(2 * HOUR),
} as Project;

async function status(project: Partial<Project>): Promise<CanSubmitStatus> {
    const client = new CloudClient({} as CloudSessionManager);
    Object.assign(client, { project: async () => ({ ...open, ...project }) });
    return (await client.isProjectAcceptingSubmissions('project')).status;
}

describe('CloudClient', () => {
    describe('isProjectAcceptingSubmissions', () => {
        it('should be open within the window', async () => {
            expect(await status({})).to.equal(CanSubmitStatus.OPEN);
        });

        it('should be late after the deadline', async () => {
            expect(await status({ deadline: at(-1) })).to.equal(CanSubmitStatus.LATE);
        });

        it('should say too early, not "not allowed", before the project opens', async () => {
            expect(await status({ availableAfter: at(HOUR), canSubmit: false })).to.equal(CanSubmitStatus.NOT_OPEN);
        });

        it('should say closed, not "not allowed", once the project has closed', async () => {
            expect(await status({ closesAt: at(-1), canSubmit: false })).to.equal(CanSubmitStatus.CLOSED);
        });

        it('should not let staff submit', async () => {
            expect(await status({ role: 'owner', canSubmit: false })).to.equal(CanSubmitStatus.NOT_ALLOWED);
            expect(await status({ role: 'assistant', canSubmit: false })).to.equal(CanSubmitStatus.NOT_ALLOWED);
        });

        it('should trust the registry when it refuses a student within the window', async () => {
            expect(await status({ canSubmit: false })).to.equal(CanSubmitStatus.NOT_ALLOWED);
        });
    });
});
