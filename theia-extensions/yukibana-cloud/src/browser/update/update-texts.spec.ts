/**
 * SPDX-License-Identifier: MIT
 */
import { URI } from '@theia/core/lib/common/uri';
import { expect } from 'chai';
import { describe, it } from 'vitest';
import { AvailableUpdate, DecidedRow, PendingRow, UpdateRows, UpdateUri } from '../../common/update-protocol';
import { describe as describeRow, notification, statusText, updateButton } from './update-texts';

const decided = (path: string, kind: DecidedRow['kind'], flags: Partial<DecidedRow> = {}): DecidedRow => ({
    path,
    kind,
    protected: false,
    editedByStudent: false,
    newlyProtected: false,
    text: true,
    present: true,
    ...flags,
});
const merge = (path: string): PendingRow => ({ path, kind: 'merge', text: true, present: true });

const RELEASE = '00000000-0000-7000-8000-000000000002';
const update = (rows: Partial<UpdateRows>): AvailableUpdate => ({ from: 'a', to: RELEASE, projectTitle: 'Iterators', decided: [], pending: [], ...rows });

describe('Assignment update texts', () => {
    it('names the project and how many files the update writes', () => {
        const available = update({ decided: [decided('src/a.rs', 'write')] });
        expect(updateButton(available)).to.equal('Update 1 file');
        expect(notification(available)).to.equal('Your teacher updated "Iterators". 1 file will be updated; you have not changed any of them.');
    });

    it("warns in the notification when the update replaces a student's edits to a read-only file", () => {
        const available = update({
            decided: [decided('tests/t.rs', 'write', { protected: true, editedByStudent: true }), decided('src/a.rs', 'write')],
            pending: [merge('src/lib.rs')],
        });
        expect(notification(available)).to.equal(
            'Your teacher updated "Iterators". 2 files will be updated, and your changes to 1 of them will be replaced because they are read-only. You and your teacher both changed 1 file. Yours will be kept, and you can merge in your teacher\'s changes afterwards.',
        );
    });

    it('escapes a project title so that it cannot add Markdown to the notification', () => {
        const available = { ...update({ decided: [decided('src/a.rs', 'write')] }), projectTitle: '[click](https://example.com)' };
        expect(notification(available)).not.to.contain('[click](');
    });

    it('says a file is new rather than changed when the student never had it', () => {
        expect(describeRow(decided('src/new.rs', 'write', { present: false }))).to.equal('new file');
        expect(describeRow(decided('src/a.rs', 'write'))).to.equal('changed');
    });

    it('shows files still to merge in the status bar until the student settles them', () => {
        const last = { from: 'a', to: RELEASE, at: '2026-11-06T10:00:00Z', decided: [], pending: [merge('src/lib.rs'), merge('src/b.rs')] };
        expect(statusText({ rolledBack: false, last })?.text).to.contain('2 files to merge');
        expect(statusText({ rolledBack: false, last: { ...last, pending: [] } })).to.equal(undefined);
    });
});

describe('Assignment update URIs', () => {
    it("round-trip a release's version of a file, keeping its name for the editor's language", () => {
        const parts = { workspace: 'file:///home/student/warm up', side: { kind: 'release', release: RELEASE } as const, path: 'src/lib.rs' };
        const uri = UpdateUri.encode(parts);
        expect(uri.path.base).to.equal('lib.rs');
        expect(UpdateUri.decode(new URI(uri.toString()))).to.deep.equal(parts);
    });

    it('round-trip the version from before the update', () => {
        const parts = { workspace: 'file:///w', side: { kind: 'before' } as const, path: 'tests/a b.rs' };
        expect(UpdateUri.decode(new URI(UpdateUri.encode(parts).toString()))).to.deep.equal(parts);
    });

    it('are not read from a URI of another scheme or without a workspace', () => {
        expect(UpdateUri.decode(new URI('file:///before/src/lib.rs?file:///w'))).to.equal(undefined);
        expect(UpdateUri.decode(new URI('yukibana-update:/before/src/lib.rs'))).to.equal(undefined);
    });
});
