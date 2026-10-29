/**
 * SPDX-License-Identifier: MIT
 */
import { nls } from '@theia/core';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import * as React from 'react';

export class OpenProjectNewWindowDialog extends ReactDialog<boolean> {
    constructor() {
        super({
            title: nls.localize('yukibana/cloud/openProject/title', 'Opening project'),
        });
        this.appendCloseButton(nls.localize('yukibana/cloud/openProject/thisWindow', 'In this window'));
        this.appendAcceptButton(nls.localize('yukibana/cloud/openProject/newWindow', 'In a new window'));
    }

    protected render(): React.ReactNode {
        const details = nls.localize('yukibana/cloud/openProject/where', 'Where do you want to open the project?');
        return <p>{details}</p>;
    }

    get value(): boolean {
        return true;
    }
}
