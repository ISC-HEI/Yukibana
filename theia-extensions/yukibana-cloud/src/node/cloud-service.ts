/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger } from '@theia/core';
import { KeyStoreService } from '@theia/core/lib/common/key-store';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { CallbackOutcome, loginWithLoopback, Session } from '@yukibana/cli';
import { LoginResult } from '../common/cloud-protocol';

const DEFAULT_REGISTRY = 'https://cloud.yukibana.dev';
const SESSION_KEY = 'yukibana.cloud.session';
const SESSION_ACCOUNT = 'session';

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

@injectable()
export class CloudService {
    @inject(ILogger) @named('yukibana:CloudService') protected readonly logger!: ILogger;
    @inject(KeyStoreService) protected readonly keyStoreService!: KeyStoreService;

    private pending?: Promise<LoginResult>;

    private loginCallbackPage(outcome: CallbackOutcome): string {
        const [title, text] = outcome.ok
            ? ['Signed in to Yukibana', 'You may close this tab and return to the application.']
            : ['Sign-in was not completed', escapeHtml(outcome.reason)];
        return (
            '<!doctype html>' +
            '<meta charset="utf-8">' +
            `<title>${title}</title>` +
            '<body style="font-family:system-ui;max-width:32rem;margin:4rem auto">' +
            `<h1>${title}</h1>` +
            `<p>${text}</p>` +
            '</body>'
        );
    }

    async login(open: (url: string) => void): Promise<LoginResult> {
        this.pending ??= this.doLogin(open).finally(() => { this.pending = undefined; });
        return this.pending;
    }

    private async doLogin(open: (url: string) => void): Promise<LoginResult> {
        this.logger.info('Logging in...');
        try {
            const session = await loginWithLoopback(DEFAULT_REGISTRY, {
                callbackPage: o => this.loginCallbackPage(o),
                open: url => open(url.toString()),
            });
            this.logger.info('Received session');
            await this.saveSession(session);
            return { ok: true };
        } catch (e) {
            return {
                ok: false,
                reason: e instanceof Error ? e.message : String(e),
            };
        }
    }

    async logout(): Promise<void> {
        this.logger.info('Logging out...');
        await this.deleteSession();
    }

    async isLoggedIn(): Promise<boolean> {
        const session = await this.getSession();
        return !!session;
    }

    private async saveSession(session: Session): Promise<void> {
        await this.keyStoreService.setPassword(SESSION_KEY, SESSION_ACCOUNT, JSON.stringify(session));
    }

    private async deleteSession(): Promise<void> {
        await this.keyStoreService.deletePassword(SESSION_KEY, SESSION_ACCOUNT);
    }

    private async getSession(): Promise<Session | undefined> {
        const session = await this.keyStoreService.getPassword(SESSION_KEY, SESSION_ACCOUNT);
        if (!session) {
            return undefined;
        }
        try {
            return JSON.parse(session) as Session;
        } catch {
            await this.deleteSession();
            return undefined;
        }
    }
}
