/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { CloudService } from '../common/cloud-protocol';

@injectable()
export class CloudServiceImpl implements CloudService {
    @inject(ILogger) @named('yukibana:CloudService') protected readonly logger!: ILogger;
}
