/**
 * SPDX-License-Identifier: MIT
 */
import { AIIdeActivationServiceImpl } from '@theia/ai-ide/lib/browser/ai-ide-activation-service';
import { PREFERENCE_NAME_ENABLE_AI } from '@theia/ai-ide/lib/common/ai-ide-preferences';
import { MaybePromise } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ConfigProvider } from './config/config-provider';

@injectable()
export class YukibanaAIIdeActivationService extends AIIdeActivationServiceImpl {
    @inject(ConfigProvider) protected readonly configProvider: ConfigProvider;

    protected override updateEnableValue(value: boolean): void {
        super.updateEnableValue(value && this.configProvider.config.features.ai);
    }

    protected refreshValue(): void {
        this.updateEnableValue(this.preferenceService.get<boolean>(PREFERENCE_NAME_ENABLE_AI, false));
    }

    override initialize(): MaybePromise<void> {
        super.initialize();
        this.configProvider.ready.then(() => {
            this.configProvider.onConfigChanged(() => this.refreshValue());
            this.refreshValue();
        });
    }
}
