/** @type {import('eslint').Linter.Config} */
module.exports = {
    extends: [
        '../configs/base.eslintrc.json',
        '../configs/warnings.eslintrc.json',
        '../configs/errors.eslintrc.json'
    ],
    ignorePatterns: [
        '**/{node_modules,lib}',
        '.eslintrc.js',
        'playwright-report',
        'test-results'
    ],
    parserOptions: {
        tsconfigRootDir: __dirname,
        project: 'tsconfig.json'
    }
};