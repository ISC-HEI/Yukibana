/**
 * SPDX-License-Identifier: MIT
 */
import { Emitter, ILogger } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { CloudAccount, CloudAuth } from '../common/cloud-protocol';
import { AuthClientImpl } from './cloud-auth-client';

export type CloudAccountState =
    | { readonly kind: 'unknown' }
    | { readonly kind: 'logged-out' }
    | { readonly kind: 'logged-in'; readonly account: CloudAccount }
    | { readonly kind: 'error'; readonly reason: string };

/** Which cloud account this window is using, kept up to date across logins and logouts. */
@injectable()
export class CloudAccountService {
    @inject(CloudAuth) protected readonly auth!: CloudAuth;
    @inject(AuthClientImpl) protected readonly authClient!: AuthClientImpl;
    @inject(ILogger) @named('yukibana:CloudAccount') protected readonly logger!: ILogger;

    private _state: CloudAccountState = { kind: 'unknown' };
    private latestRefresh = 0;
    private inFlight?: Promise<CloudAccountState>;

    private readonly onDidChangeEmitter = new Emitter<CloudAccountState>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        this.authClient.onLoginChanged(() => {
            // A check that began before the change cannot answer for after it
            this.inFlight = undefined;
            this.refresh();
        });
    }

    get state(): CloudAccountState {
        return this._state;
    }

    get account(): CloudAccount | undefined {
        return this._state.kind === 'logged-in' ? this._state.account : undefined;
    }

    /** Asks the backend who is logged in, joining a check already under way. */
    refresh(): Promise<CloudAccountState> {
        if (!this.inFlight) {
            const check = this.check();
            this.inFlight = check;
            check.finally(() => {
                if (this.inFlight === check) {
                    this.inFlight = undefined;
                }
            });
        }
        return this.inFlight;
    }

    private async check(): Promise<CloudAccountState> {
        const refresh = ++this.latestRefresh;
        let state: CloudAccountState;
        try {
            const account = await this.auth.whoAmI();
            state = account ? { kind: 'logged-in', account } : { kind: 'logged-out' };
        } catch (e) {
            state = { kind: 'error', reason: e instanceof Error ? e.message : String(e) };
        }
        // A refresh started after this one, e.g. by a logout, knows better
        if (refresh === this.latestRefresh) {
            this.setState(state);
        }
        return state;
    }

    protected setState(state: CloudAccountState): void {
        // Listeners rebuild menus, and in Electron the whole native menu bar, so only tell them about a change
        if (JSON.stringify(state) === JSON.stringify(this._state)) {
            return;
        }
        const before = this.account;
        this._state = state;
        if (state.kind === 'logged-in' && state.account.userId !== before?.userId) {
            this.logger.info(`Logged in to the cloud registry as ${CloudAccount.label(state.account)} (user ${state.account.userId}, platform role ${state.account.platformRole})`);
        } else if (state.kind === 'error') {
            this.logger.warn(`Could not get the logged-in account: ${state.reason}`);
        }
        this.onDidChangeEmitter.fire(state);
    }
}
