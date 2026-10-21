/**
 * SPDX-License-Identifier: MIT
 */
import { Emitter, ILogger } from '@theia/core';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { AuthClient } from '../common/cloud-protocol';

@injectable()
export class AuthClientImpl implements AuthClient {
    @inject(ILogger) @named('yukibana:AuthClient') protected readonly logger!: ILogger;
    @inject(WindowService) protected readonly windowService!: WindowService;

    private readonly onLoginChangedEmitter = new Emitter<void>();
    readonly onLoginChanged = this.onLoginChangedEmitter.event;

    private readonly onLoginCodeEmitter = new Emitter<string>();
    /** The code the login page shows, when the login just opened has one. */
    readonly onLoginCode = this.onLoginCodeEmitter.event;

    openLoginUrl(url: string, code?: string): void {
        this.logger.info('Opening login url...');
        this.windowService.openNewWindow(url, { external: true });
        if (code) {
            this.onLoginCodeEmitter.fire(code);
        }
    }

    notifyLoginChanged(): void {
        this.onLoginChangedEmitter.fire();
    }
}
