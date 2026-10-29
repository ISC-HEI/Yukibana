/**
 * SPDX-License-Identifier: MIT
 */
// @vitest-environment jsdom
/* eslint-disable no-null/no-null */ // the registry sends missing account details as null
import { ILogger } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Project } from '@yukibana/cli';
import { expect } from 'chai';
import { describe, it } from 'vitest';
import { CanSubmitStatus, CloudAccount, CloudAuth, CloudService, SubmissionResult } from '../common/cloud-protocol';
import { ACCOUNT_ACTIONS_GROUP, ACCOUNT_INFO_GROUP, accountMenuItems, accountStatusBarEntry } from './cloud-account-menu';
import { CloudAccountService } from './cloud-account-service';
import { AuthClientImpl } from './cloud-auth-client';
import { CloudSubmissionTarget } from './cloud-submission-target';

const account: CloudAccount = {
    userId: '095fc917-0000-0000-0000-000000000000',
    email: 'ambrus@example.com',
    fullName: 'Ambrus Tóth',
    githubLogin: 'tothambrus11',
    platformRole: 'admin',
};

function setupAccounts(whoAmI: () => Promise<CloudAccount | undefined>): { accounts: CloudAccountService; authClient: AuthClientImpl } {
    const auth = { whoAmI };
    const authClient = new AuthClientImpl();
    const accounts = new CloudAccountService();
    Object.assign(accounts, {
        auth: auth as unknown as CloudAuth,
        authClient,
        logger: new MockLogger() as ILogger,
    });
    (accounts as unknown as { init(): void }).init();
    return { accounts, authClient };
}

describe('CloudAccount', () => {
    it('should label an account by email, then GitHub login, then name, then id', () => {
        expect(CloudAccount.label(account)).to.equal('ambrus@example.com');
        expect(CloudAccount.label({ ...account, email: null })).to.equal('tothambrus11');
        expect(CloudAccount.label({ ...account, email: null, githubLogin: null })).to.equal('Ambrus Tóth');
        expect(CloudAccount.label({ ...account, email: null, githubLogin: null, fullName: null })).to.equal(account.userId);
    });

    it('should call the person by their display name, or else their label', () => {
        expect(CloudAccount.displayName(account)).to.equal('Ambrus Tóth');
        expect(CloudAccount.displayName({ ...account, fullName: null })).to.equal('ambrus@example.com');
    });
});

describe('accountMenuItems', () => {
    const labels = (group: string[]) => (items: ReturnType<typeof accountMenuItems>) => items.filter(i => i.group === group).map(i => i.label);
    const infoLabels = labels(ACCOUNT_INFO_GROUP);
    const actionLabels = labels(ACCOUNT_ACTIONS_GROUP);

    it('should say whom the person is logged in as, and offer to switch or log out', () => {
        const items = accountMenuItems({ kind: 'logged-in', account });
        expect(infoLabels(items)).to.deep.equal(['Logged in as: ambrus@example.com']);
        expect(actionLabels(items)).to.deep.equal(['Switch account', 'Log out']);
    });

    it('should name an account without an email by its GitHub login', () => {
        const items = accountMenuItems({ kind: 'logged-in', account: { ...account, email: null } });
        expect(infoLabels(items)).to.deep.equal(['Logged in as: tothambrus11']);
    });

    it('should offer to log in when nobody is logged in', () => {
        const items = accountMenuItems({ kind: 'logged-out' });
        expect(infoLabels(items)).to.deep.equal(['Not logged in']);
        expect(actionLabels(items)).to.deep.equal(['Log in']);
    });

    it('should show why the account could not be checked and offer to retry or log out', () => {
        const items = accountMenuItems({ kind: 'error', reason: 'fetch failed' });
        expect(infoLabels(items)).to.deep.equal(['Could not check your account: fetch failed']);
        expect(actionLabels(items)).to.deep.equal(['Try again', 'Log out']);
    });

    it('should use a distinct command for every line', () => {
        const items = accountMenuItems({ kind: 'logged-in', account });
        expect(new Set(items.map(i => i.commandId)).size).to.equal(items.length);
    });
});

describe('accountStatusBarEntry', () => {
    it('should show the display name, the email on hover, and open the account menu', () => {
        const entry = accountStatusBarEntry({ kind: 'logged-in', account });
        expect(entry.text).to.equal('$(account) Ambrus Tóth');
        expect(entry.tooltip).to.equal('Logged in as: ambrus@example.com');
        expect(entry.onclick).to.equal(undefined);
        expect(accountStatusBarEntry({ kind: 'logged-in', account }, () => undefined).onclick).to.be.a('function');
    });

    it('should show the email when there is no display name', () => {
        expect(accountStatusBarEntry({ kind: 'logged-in', account: { ...account, fullName: null } }).text).to.equal('$(account) ambrus@example.com');
    });

    it('should offer to log in when nobody is logged in', () => {
        expect(accountStatusBarEntry({ kind: 'logged-out' }).text).to.equal('$(account) Log in');
    });

    it('should show why the account is unavailable', () => {
        const entry = accountStatusBarEntry({ kind: 'error', reason: 'fetch failed' });
        expect(entry.text).to.contain('Account unavailable');
        expect(entry.tooltip).to.contain('fetch failed');
    });
});

describe('CloudAccountService', () => {
    it('should know the logged-in account after a refresh', async () => {
        const { accounts } = setupAccounts(async () => account);
        const changes: string[] = [];
        accounts.onDidChange(state => changes.push(state.kind));
        expect(await accounts.refresh()).to.deep.equal({ kind: 'logged-in', account });
        expect(accounts.state).to.deep.equal({ kind: 'logged-in', account });
        expect(accounts.account).to.equal(account);
        expect(changes).to.deep.equal(['logged-in']);
    });

    it('should know when nobody is logged in', async () => {
        const { accounts } = setupAccounts(async () => undefined);
        await accounts.refresh();
        expect(accounts.state).to.deep.equal({ kind: 'logged-out' });
        expect(accounts.account).to.equal(undefined);
    });

    it('should keep the error if the registry cannot be reached', async () => {
        const { accounts } = setupAccounts(async () => {
            throw new Error('fetch failed');
        });
        await accounts.refresh();
        expect(accounts.state).to.deep.equal({ kind: 'error', reason: 'fetch failed' });
    });

    it('should share a check already under way', async () => {
        let calls = 0;
        const { accounts } = setupAccounts(async () => {
            calls++;
            return account;
        });
        await Promise.all([accounts.refresh(), accounts.refresh()]);
        expect(calls).to.equal(1);
    });

    it('should not share a check that began before a login changed', async () => {
        let calls = 0;
        const { accounts, authClient } = setupAccounts(async () => {
            calls++;
            return account;
        });
        const before = accounts.refresh();
        authClient.notifyLoginChanged();
        await Promise.all([before, accounts.refresh()]);
        expect(calls).to.equal(2);
    });

    it('should not tell listeners about an answer that changes nothing', async () => {
        const { accounts } = setupAccounts(async () => account);
        let changes = 0;
        accounts.onDidChange(() => changes++);
        await accounts.refresh();
        await accounts.refresh();
        expect(changes).to.equal(1);
    });

    it('should keep the answer of the latest refresh when an earlier one finishes last', async () => {
        const answers = [new Deferred<CloudAccount | undefined>(), new Deferred<CloudAccount | undefined>()];
        let call = 0;
        const { accounts, authClient } = setupAccounts(() => answers[call++].promise);
        const before = accounts.refresh();
        // A login change starts a check of its own, which later refreshes join
        authClient.notifyLoginChanged();
        const after = accounts.refresh();
        answers[1].resolve(undefined);
        await after;
        answers[0].resolve(account);
        await before;
        expect(accounts.state).to.deep.equal({ kind: 'logged-out' });
    });

    it('should refresh when someone logs in or out', async () => {
        let current: CloudAccount | undefined = account;
        const { accounts, authClient } = setupAccounts(async () => current);
        await accounts.refresh();
        current = undefined;
        const changed = new Promise(resolve => accounts.onDidChange(resolve));
        authClient.notifyLoginChanged();
        expect(await changed).to.deep.equal({ kind: 'logged-out' });
    });
});

describe('CloudSubmissionTarget', () => {
    const project = { projectId: 'project', courseCode: 'OS', editionLabel: '2026.Q1', role: 'owner' } as Project;

    function setupTarget(current: CloudAccount | undefined, options: { result?: SubmissionResult; status?: CanSubmitStatus; info?: Project } = {}): CloudSubmissionTarget {
        const { accounts } = setupAccounts(async () => current);
        const target = new CloudSubmissionTarget();
        Object.assign(target, {
            service: {
                submit: async () => options.result,
                canSubmitProject: async () => ({ status: options.status ?? CanSubmitStatus.OPEN, project: options.info }),
            } as unknown as CloudService,
            accounts,
        });
        return target;
    }

    it('should say which account and role is not allowed to submit', async () => {
        const target = setupTarget(account, { status: CanSubmitStatus.NOT_ALLOWED, info: project });
        const availability = await target.getAvailability('project');
        expect(availability).to.deep.equal({
            available: false,
            reason: 'You are not allowed to submit for this project: you are its owner in OS 2026.Q1, logged in as ambrus@example.com. Only enrolled students can submit.',
            actions: [{ label: 'Switch account', command: 'yukibana.cloudSwitchAccount' }],
        });
    });

    it('should say which account a student is not allowed to submit with', async () => {
        const target = setupTarget(account, { status: CanSubmitStatus.NOT_ALLOWED, info: { ...project, role: 'student' } });
        const availability = await target.getAvailability('project');
        expect(availability.available).to.equal(false);
        if (!availability.available) {
            expect(availability.reason).to.equal('You are not allowed to submit for this project (logged in as ambrus@example.com)');
        }
    });

    it('should offer to log in when nobody is logged in', async () => {
        const target = setupTarget(undefined);
        const availability = await target.getAvailability('project');
        expect(availability.available).to.equal(false);
        if (!availability.available) {
            expect(availability.actions.map(a => a.command)).to.deep.equal(['yukibana.cloudLogin']);
        }
    });

    it('should say which account a refused submission was made with', async () => {
        const target = setupTarget(account, { result: { ok: false, reason: 'the registry answered 403: This project is not accepting submissions from you now.' } });
        const result = await target.submit('project', 'submission-1');
        expect(result).to.deep.equal({
            ok: false,
            reason: 'the registry answered 403: This project is not accepting submissions from you now. (logged in as ambrus@example.com)',
        });
    });

    it('should leave the reason alone if nobody is logged in', async () => {
        const target = setupTarget(undefined, { result: { ok: false, reason: 'not logged in' } });
        expect(await target.submit('project', 'submission-1')).to.deep.equal({ ok: false, reason: 'not logged in' });
    });

    it('should pass a successful submission through', async () => {
        const accepted = { ok: true, submissionId: 'submission', byteSize: 1, sha256: '00' } as SubmissionResult;
        const target = setupTarget(account, { result: accepted });
        expect(await target.submit('project', 'submission-1')).to.equal(accepted);
    });
});
