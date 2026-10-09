/**
 * SPDX-License-Identifier: MIT
 */
import { inject, injectable } from '@theia/core/shared/inversify';
import { tokenProvider, YukibanaClient } from '@yukibana/cli';
import { CloudSessionManager, DEFAULT_REGISTRY } from './cloud-session-manager';

@injectable()
export class CloudClient extends YukibanaClient {
    constructor(
        @inject(CloudSessionManager) protected readonly cloudService: CloudSessionManager,
    ) {
        super({
            url: DEFAULT_REGISTRY,
            accessToken: tokenProvider(cloudService)
        });
    }
}
