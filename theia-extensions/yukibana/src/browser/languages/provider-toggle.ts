/**
 * SPDX-License-Identifier: MIT
 */
import { Disposable, MaybePromise } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';
import { YukibanaConfig } from '../../common/yukibana-config';
import { ConfigProvider } from '../config/config-provider';

export type RegisterFunctionName = Extract<keyof typeof monaco.languages, `register${string}Provider`>;

// oxlint-disable-next-line typescript/no-explicit-any
type RegisterFunction = (selector: unknown, provider: any, ...rest: unknown[]) => Disposable;

interface PendingRegistration {
    // oxlint-disable-next-line typescript/no-explicit-any
    args: [unknown, any, ...unknown[]];
    disposable: Disposable;
    disposed: boolean;
}

/**
 * Abstract class which wraps registered language providers with a conditional
 * to allow toggling them through the config. We use a bit of reflection and
 * Typescript magic to make this generic and avoid duplicating the whole class
 * for each kind of provider we want to handle.
 *
 * Providers registered before the config is loaded are stored in a queue.
 */
@injectable()
export abstract class LanguageProviderToggleContribution implements FrontendApplicationContribution {
    @inject(ConfigProvider) protected readonly configProvider: ConfigProvider;

    protected abstract readonly registerFunction: RegisterFunctionName;

    protected abstract isEnabled(config: YukibanaConfig): boolean;

    protected isPassthrough(key: string | symbol): boolean {
        return typeof key !== 'string' || key.startsWith('onDid') || key.startsWith('free') || key === 'dispose';
    }

    protected pending: PendingRegistration[] = [];

    protected originalRegister: RegisterFunction;

    private get languages(): Record<string, RegisterFunction> {
        return monaco.languages as unknown as Record<string, RegisterFunction>;
    }

    initialize(): MaybePromise<void> {
        this.originalRegister = this.languages[this.registerFunction];
        this.languages[this.registerFunction] = (...args) => {
            const entry: PendingRegistration = {
                args,
                disposable: Disposable.NULL,
                disposed: false,
            };
            this.pending.push(entry);
            return {
                dispose: () => {
                    entry.disposed = true;
                    entry.disposable.dispose();
                },
            };
        };
        this.configProvider.ready.then(() => this.flush());
    }

    protected wrap<P extends object>(provider: P): P {
        return new Proxy(provider, {
            get: (target, key) => {
                const value = Reflect.get(target, key, target);
                if (typeof value !== 'function' || this.isPassthrough(key)) {
                    return typeof value === 'function' ? value.bind(target) : value;
                }
                return (...args: unknown[]) => (this.isEnabled(this.configProvider.config) ? value.apply(target, args) : undefined);
            },
        });
    }

    protected registerProvider(selector: unknown, provider: object, ...rest: unknown[]): Disposable {
        return this.originalRegister.call(monaco.languages, selector, this.wrap(provider), ...rest);
    }

    protected flush(): void {
        this.languages[this.registerFunction] = (selector, provider, ...rest) => this.registerProvider(selector, provider, ...rest);
        for (const entry of this.pending) {
            if (entry.disposed) {
                continue;
            }
            const [selector, provider, ...rest] = entry.args;
            entry.disposable = this.registerProvider(selector, provider, ...rest);
        }
        this.pending = [];
    }
}
