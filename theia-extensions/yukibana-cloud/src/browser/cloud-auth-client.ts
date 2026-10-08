/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger } from '@theia/core';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { AuthClient } from '../common/cloud-protocol';

@injectable()
export class AuthClientImpl implements AuthClient {
    @inject(ILogger) @named('yukibana:AuthClient') protected readonly logger!: ILogger;
    @inject(WindowService) protected readonly windowService!: WindowService;

    openLoginUrl(url: string): void {
        this.logger.info('Opening login url...');
        this.windowService.openNewWindow(url, { external: true });
    }
}
