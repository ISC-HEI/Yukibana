/**
 * SPDX-License-Identifier: MIT
 */
import { Emitter, ILogger } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Me, NotLoggedIn, RegistryError } from '@yukibana/cli';
import { expect } from 'chai';
import { describe, it } from 'vitest';
import { AuthClient } from '../common/cloud-protocol';
import { CloudAuthImpl } from './cloud-auth';
import { CloudClient, isRefused } from './cloud-client';
import { CloudSessionManager } from './cloud-session-manager';

const me: Me = {
    userId: '095fc917-0000-0000-0000-000000000000',
    email: 'student@example.com',
    fullName: 'Ada Student',
    githubLogin: 'ada',
    platformRole: 'user',
};

interface Mocks {
    auth: CloudAuthImpl;
    loginChanged: Emitter<void>;
    /** How often the frontend heard of a change, and the frontend itself, to set again. */
    notified: number;
    frontend: () => void;
    /** Calls on the session manager and the client, in order. */
    calls: string[];
}

function setup(options: { loggedIn: boolean; me?: () => Promise<Me> }): Mocks {
    const loginChanged = new Emitter<void>();
    const mocks = { loginChanged, notified: 0, calls: [] as string[] };
    const sessions = {
        isLoggedIn: async () => options.loggedIn,
        onLoginChanged: loginChanged.event,
        forget: async () => {
            mocks.calls.push('forget');
        },
        logout: async () => {
            mocks.calls.push('logout');
        },
        switchAccount: async () => {
            mocks.calls.push('switchAccount');
            return { ok: true };
        },
    };
    const client = {
        me: async () => {
            mocks.calls.push('me');
            return options.me ? options.me() : me;
        },
    };
    const auth = new CloudAuthImpl();
    Object.assign(auth, {
        service: sessions as unknown as CloudSessionManager,
        cloudClient: client as unknown as CloudClient,
        logger: new MockLogger() as ILogger,
    });
    (auth as unknown as { init(): void }).init();
    const frontend = (): void => {
        mocks.notified++;
    };
    auth.setClient({ openLoginUrl: () => undefined, notifyLoginChanged: frontend } as AuthClient);
    return {
        auth,
        frontend,
        loginChanged,
        calls: mocks.calls,
        get notified(): number {
            return mocks.notified;
        },
    };
}

describe('CloudAuthImpl', () => {
    describe('whoAmI', () => {
        it('should return the account of the session', async () => {
            const { auth } = setup({ loggedIn: true });
            expect(await auth.whoAmI()).to.deep.equal(me);
        });

        it('should not ask the registry if nobody is logged in', async () => {
            const mocks = setup({ loggedIn: false });
            expect(await mocks.auth.whoAmI()).to.equal(undefined);
            expect(mocks.calls).to.deep.equal([]);
        });

        it('should forget a session the Auth server refuses to renew, so logging in works again', async () => {
            const refused = new NotLoggedIn('the session has expired and could not be renewed (the Auth server answered 400: invalid_grant); log in again');
            const mocks = setup({
                loggedIn: true,
                me: async () => {
                    throw refused;
                },
            });
            expect(await mocks.auth.whoAmI()).to.equal(undefined);
            expect(mocks.calls).to.deep.equal(['me', 'forget']);
        });

        it('should keep a session it could not renew for want of a network', async () => {
            const offline = new NotLoggedIn('the session has expired and could not be renewed (fetch failed); log in again');
            const mocks = setup({
                loggedIn: true,
                me: async () => {
                    throw offline;
                },
            });
            const error = await mocks.auth.whoAmI().then(
                () => undefined,
                e => e,
            );
            expect(error).to.equal(offline);
            expect(mocks.calls).to.deep.equal(['me']);
        });

        it('should forget a session the registry refuses', async () => {
            const mocks = setup({
                loggedIn: true,
                me: async () => {
                    throw new RegistryError(401, 'the registry answered 401');
                },
            });
            expect(await mocks.auth.whoAmI()).to.equal(undefined);
            expect(mocks.calls).to.deep.equal(['me', 'forget']);
        });

        it('should report other errors and keep the session', async () => {
            const mocks = setup({
                loggedIn: true,
                me: async () => {
                    throw new TypeError('fetch failed');
                },
            });
            const error = await mocks.auth.whoAmI().then(
                () => undefined,
                e => e,
            );
            expect(error).to.be.instanceOf(TypeError);
            expect(mocks.calls).to.deep.equal(['me']);
        });
    });

    describe('isRefused', () => {
        it('should count only answers that refuse the session', () => {
            expect(isRefused(new RegistryError(401, 'the registry answered 401'))).to.equal(true);
            expect(isRefused(new NotLoggedIn('could not be renewed (the Auth server answered 401: bad jwt)'))).to.equal(true);
            expect(isRefused(new RegistryError(500, 'the registry answered 500'))).to.equal(false);
            expect(isRefused(new NotLoggedIn('could not be renewed (the Auth server answered 503)'))).to.equal(false);
            expect(isRefused(new NotLoggedIn('could not be renewed (The operation was aborted due to timeout)'))).to.equal(false);
            expect(isRefused(new TypeError('fetch failed'))).to.equal(false);
        });
    });

    describe('login changes', () => {
        it('should tell the frontend about logins and logouts', () => {
            const mocks = setup({ loggedIn: true });
            mocks.loginChanged.fire();
            mocks.loginChanged.fire();
            expect(mocks.notified).to.equal(2);
        });

        it('should stop listening once disposed', () => {
            const mocks = setup({ loggedIn: true });
            mocks.auth.dispose();
            // A client set again after disposal would still hear a listener that leaked
            mocks.auth.setClient({ openLoginUrl: () => undefined, notifyLoginChanged: mocks.frontend } as AuthClient);
            mocks.loginChanged.fire();
            expect(mocks.notified).to.equal(0);
        });
    });
});
