/**
 * SPDX-License-Identifier: MIT
 */
import { expect } from 'chai';
import { DEFAULT_CONFIG, loadConfig } from './yukibana-config';

interface ConfigError {
    key: string[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any
}

/* eslint-disable no-null/no-null */
describe('loadConfig', () => {
    it('should provide defaults for an empty config', () => {
        const config = loadConfig('{}');
        expect(config).to.be.deep.equal(DEFAULT_CONFIG);
        expect(config).to.be.deep.equal({
            assignmentFile: 'ASSIGNMENT.md',
            features: {
                codeSuggestions: true,
                squiggles: true,
                ai: true,
            },
            layout: {
                widgets: {
                    files: true,
                    search: true,
                    vcs: true,
                    debug: true,
                    testing: true,
                    outline: true,
                    aiChat: true,
                },
                containers: {},
                views: {},
            },
            openFiles: [],
            readOnly: [],
            submission: {
                include: null,
                exclude: [],
                respectGitignore: true,
                target: 'cloud',
                filename: 'submission.tar.gz',
                maxBytes: 32 * 1024 * 1024,
            },
            projectId: null,
        });
    });

    const errors: ConfigError[] = [
        { key: ['assignmentFile'], value: null },
        { key: ['features'], value: [] },
        { key: ['features', 'codeSuggestions'], value: 0 },
        { key: ['features', 'squiggles'], value: 0 },
        { key: ['features', 'ai'], value: 0 },
        { key: ['layout'], value: [] },
        { key: ['layout', 'widgets'], value: [] },
        { key: ['layout', 'widgets', 'files'], value: 0 },
        { key: ['layout', 'widgets', 'search'], value: 0 },
        { key: ['layout', 'widgets', 'vcs'], value: 0 },
        { key: ['layout', 'widgets', 'debug'], value: 0 },
        { key: ['layout', 'widgets', 'testing'], value: 0 },
        { key: ['layout', 'widgets', 'outline'], value: 0 },
        { key: ['layout', 'widgets', 'aiChat'], value: 0 },
        { key: ['layout', 'containers'], value: [] },
        { key: ['layout', 'views'], value: [] },
        { key: ['openFiles'], value: {} },
        { key: ['readOnly'], value: {} },
        { key: ['submission'], value: [] },
        { key: ['submission', 'include'], value: {} },
        { key: ['submission', 'exclude'], value: {} },
        { key: ['submission', 'respectGitignore'], value: 0 },
        { key: ['submission', 'target'], value: null },
        { key: ['projectId'], value: '' },
        { key: ['projectId'], value: 'a-project-id' },
    ];

    errors.forEach(({ key, value }) => {
        it(`should throw an error if ${key.join('.')} is invalid`, () => {
            let config = value;
            [...key].reverse().forEach(part => {
                config = { [part]: config };
            });
            expect(() => loadConfig(JSON.stringify(config))).to.throw(`"${key.join('.')}"`);
        });
    });

    it('should accept extra parameters', () => {
        expect(() => loadConfig('{"extraParameter": "value"}')).to.not.throw();
    });

    it('should accept a well-formed config', () => {
        const config = {
            assignmentFile: 'custom.md',
            features: {
                codeSuggestions: false,
                squiggles: false,
                ai: false,
            },
            layout: {
                widgets: {
                    files: false,
                    search: false,
                    vcs: false,
                    debug: false,
                    testing: false,
                    outline: false,
                    aiChat: false,
                },
                containers: {
                    'container1': false,
                },
                views: {
                    'view1': false,
                },
            },
            openFiles: [
                'open-file.txt',
            ],
            readOnly: [
                'read-only.txt',
            ],
            submission: {
                include: [
                    'to-include.txt',
                ],
                exclude: [
                    'to-exclude.txt',
                ],
                respectGitignore: false,
                target: 'custom',
                filename: 'submission.tar.gz',
                maxBytes: 32 * 1024 * 1024,
            },
            projectId: '01a0b563-aeff-7c42-ae73-5aab2f2b5a03',
        };
        const toLoad = { ...config, extraParameter: 'value' };
        expect(loadConfig(JSON.stringify(toLoad))).to.deep.equal(config);
    });
});
