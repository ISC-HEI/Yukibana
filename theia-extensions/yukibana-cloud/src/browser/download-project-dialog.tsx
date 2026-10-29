/**
 * SPDX-License-Identifier: MIT
 */
import { nls, URI } from '@theia/core';
import { DialogError } from '@theia/core/lib/browser';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import * as React from 'react';
import { FolderState, folderNameProblem } from './project-locations';

/** What the download dialog starts from, and how it looks at folders. */
export interface DownloadProjectDialogOptions {
    /** Project's title. */
    readonly title: string;
    /** Folder suggested for the project. */
    readonly destination: URI;
    /** Asks for a folder to put the project's folder in, starting at `parent`; `undefined` if none was chosen. */
    readonly browse: (parent: URI) => Promise<URI | undefined>;
    /** Returns what `folder` is for this project. */
    readonly stateOf: (folder: URI) => Promise<FolderState>;
    /** Returns `uri`'s path the way the person reads it. */
    readonly display: (uri: URI) => string;
}

/**
 * Dialog asking where a project goes: a location, which Browse replaces, and a folder name, which the project's folder
 * gets in that location. It returns that folder, which is free, or already a copy of the project, to open instead.
 */
export class DownloadProjectDialog extends ReactDialog<URI> {
    /** Folder the project's folder goes in. */
    protected location: URI;
    /** Name of the project's folder. */
    protected name: string;
    /** What the folder named by `location` and `name` is, once looked at. */
    protected state: FolderState | undefined;

    constructor(protected readonly options: DownloadProjectDialogOptions) {
        super({ title: nls.localize('yukibana/cloud/openProject/downloadTitle', "Download '{0}'", options.title) });
        this.location = options.destination.parent;
        this.name = options.destination.path.base;
        this.appendCloseButton(nls.localizeByDefault('Cancel'));
        this.appendAcceptButton(nls.localize('yukibana/cloud/openProject/download', 'Download'));
    }

    get value(): URI {
        return this.location.resolve(this.name);
    }

    protected override async isValid(value: URI): Promise<DialogError> {
        const problem = folderNameProblem(this.name);
        if (problem !== undefined) {
            this.showState(undefined);
            return problem;
        }
        const state = await this.options.stateOf(value);
        // Only the newest answer counts: the name may have changed while this one was looked up
        if (value.toString() !== this.value.toString()) {
            return false;
        }
        this.showState(state);
        switch (state) {
            case 'free':
            case 'this-project':
                return '';
            case 'other-files':
                return nls.localize('yukibana/cloud/openProject/otherFiles', "'{0}' already has other files in it. Choose another name or location.", this.name);
            case 'not-a-folder':
                return nls.localize('yukibana/cloud/openProject/notAFolder', "'{0}' is not a folder. Choose another name or location.", this.name);
        }
    }

    /** Shows `state`, the destination's, if known: the accept button opens a copy of the project, and downloads otherwise. */
    protected showState(state: FolderState | undefined): void {
        if (state === this.state) {
            return;
        }
        this.state = state;
        if (this.acceptButton) {
            this.acceptButton.textContent =
                state === 'this-project' ? nls.localize('yukibana/cloud/openProject/openExisting', 'Open') : nls.localize('yukibana/cloud/openProject/download', 'Download');
        }
        this.update();
    }

    /** Asks for another location, keeping the folder name. */
    protected browse = async (): Promise<void> => {
        const parent = await this.options.browse(this.location);
        if (parent) {
            this.location = parent;
            this.update();
        }
    };

    protected handleNameChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.name = e.target.value;
        this.update();
    };

    protected render(): React.ReactNode {
        return (
            <div className="yukibana-download-project">
                <label>{nls.localize('yukibana/cloud/openProject/location', 'Location')}</label>
                <div className="yukibana-download-project-location">
                    <input type="text" className="theia-input" value={this.options.display(this.location)} readOnly={true} />
                    <button type="button" className="theia-button secondary" onClick={this.browse}>
                        {nls.localize('yukibana/cloud/openProject/browse', 'Browse...')}
                    </button>
                </div>
                <label>{nls.localize('yukibana/cloud/openProject/folderName', 'Folder name')}</label>
                <input type="text" className="theia-input" value={this.name} onChange={this.handleNameChange} spellCheck={false} />
                <p>{this.renderDestination()}</p>
            </div>
        );
    }

    /** Returns what happens on accept, as far as known; nothing while the folder name is not one. */
    protected renderDestination(): string {
        if (folderNameProblem(this.name) !== undefined) {
            return '';
        }
        const path = this.options.display(this.value);
        return this.state === 'this-project'
            ? nls.localize('yukibana/cloud/openProject/existingCopy', 'This project is already in {0}, and will be opened.', path)
            : nls.localize('yukibana/cloud/openProject/willDownload', 'The project will be downloaded into {0}', path);
    }
}
