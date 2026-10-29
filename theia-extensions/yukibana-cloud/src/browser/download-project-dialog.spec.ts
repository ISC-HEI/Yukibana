/**
 * SPDX-License-Identifier: MIT
 */
// @vitest-environment jsdom
import { URI } from '@theia/core';
import { DialogError } from '@theia/core/lib/browser';
import { expect } from 'chai';
import { describe, it } from 'vitest';
import { DownloadProjectDialog } from './download-project-dialog';
import { FolderState } from './project-locations';

/** The dialog, with what the person would do with it, and what it says. */
class TestDialog extends DownloadProjectDialog {
    /** Types `name` into the folder name field. */
    type(name: string): void {
        this.name = name;
    }

    /** Clicks Browse. */
    clickBrowse(): Promise<void> {
        return this.browse();
    }

    /** Returns what the dialog says of its folder: '' if it can be accepted, or why not. */
    async check(): Promise<string | false> {
        const error = await this.isValid(this.value);
        return DialogError.getResult(error) ? '' : DialogError.getMessage(error) || false;
    }

    get acceptLabel(): string | null | undefined {
        return this.acceptButton?.textContent;
    }

    get line(): string {
        return this.renderDestination();
    }
}

/** Returns a dialog suggesting `destination`, over folders that are `states`, keyed by path, and free otherwise. */
function dialog(destination: string, states: Record<string, FolderState> = {}, browsed?: string): TestDialog {
    return new TestDialog({
        title: 'Warm up',
        destination: new URI(`file://${destination}`),
        browse: async () => (browsed === undefined ? undefined : new URI(`file://${browsed}`)),
        stateOf: async folder => states[folder.path.toString()] ?? 'free',
        display: uri => uri.path.toString(),
    });
}

describe('DownloadProjectDialog', () => {
    it('should offer to download into the suggested folder', async () => {
        const d = dialog('/home/student/projects/warmup');

        expect(d.value.path.toString()).to.equal('/home/student/projects/warmup');
        expect(await d.check()).to.equal('');
        expect(d.acceptLabel).to.equal('Download');
        expect(d.line).to.equal('The project will be downloaded into /home/student/projects/warmup');
    });

    it('should offer to open a copy of the project instead of downloading it', async () => {
        const d = dialog('/home/student/projects/warmup', { '/home/student/projects/warmup': 'this-project' });

        expect(await d.check()).to.equal('');
        expect(d.acceptLabel).to.equal('Open');
        expect(d.line).to.equal('This project is already in /home/student/projects/warmup, and will be opened.');
    });

    it('should refuse a folder that holds other files, or is not a folder', async () => {
        const d = dialog('/p/warmup', { '/p/warmup': 'other-files', '/p/notes.txt': 'not-a-folder' });
        expect(await d.check()).to.equal("'warmup' already has other files in it. Choose another name or location.");

        d.type('notes.txt');
        expect(await d.check()).to.equal("'notes.txt' is not a folder. Choose another name or location.");

        d.type('warmup-1');
        expect(await d.check()).to.equal('');
    });

    it('should refuse a folder name that is not one folder, without looking at the disk', async () => {
        const d = dialog('/p/warmup');
        for (const name of ['', 'a/b', '../escaped', 'a\\b', '..', ' warmup']) {
            d.type(name);
            expect(await d.check(), JSON.stringify(name))
                .to.be.a('string')
                .and.not.equal('');
            expect(d.line, JSON.stringify(name)).to.equal('');
        }
    });

    it('should go back to Download once the name no longer names the copy', async () => {
        const d = dialog('/p/warmup', { '/p/warmup': 'this-project' });
        await d.check();
        expect(d.acceptLabel).to.equal('Open');

        d.type('warmup-fresh');
        await d.check();
        expect(d.acceptLabel).to.equal('Download');
    });

    it('should put the folder, under the same name, in the location browsed to', async () => {
        const d = dialog('/home/student/projects/warmup', {}, '/srv/labs');
        d.type('my-warmup');
        await d.clickBrowse();

        expect(d.value.path.toString()).to.equal('/srv/labs/my-warmup');
    });

    it('should keep the location when Browse is cancelled', async () => {
        const d = dialog('/home/student/projects/warmup');
        await d.clickBrowse();

        expect(d.value.path.toString()).to.equal('/home/student/projects/warmup');
    });
});
