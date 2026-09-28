import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';
import globals from 'globals';

export default tseslint.config(
    { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'src/data/*.json'] },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: {
            allowDefaultProject: ['eslint.config.js', 'tools/*.mjs', 'tools/sources/*.mjs'],
        },
                tsconfigRootDir: import.meta.dirname,
            },
            globals: { ...globals.browser, ...globals.webextensions },
        },
        plugins: { security },
        rules: {
            ...security.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/no-unnecessary-condition': 'off',
            'no-restricted-globals': [
                'error',
                { name: 'eval', message: 'Banned by extension CSP.' },
            ],
            'no-restricted-properties': [
                'error',
                {
                    property: 'innerHTML',
                    message: 'Use textContent or the sanitized render helpers.',
                },
                {
                    property: 'outerHTML',
                    message: 'Use textContent or the sanitized render helpers.',
                },
            ],
            'no-restricted-syntax': [
                'error',
                {
                    selector: "NewExpression[callee.name='Function']",
                    message: 'Banned by extension CSP.',
                },
                {
                    selector: "CallExpression[callee.name='Function']",
                    message: 'Banned by extension CSP.',
                },
                {
                    selector: 'CallExpression[callee.property.name=/^(insertAdjacentHTML|write|writeln)$/]',
                    message: 'HTML injection sink. Build nodes programmatically instead.',
                },
            ],
        },
    },
    {
        files: ['eslint.config.js', 'tools/**/*.mjs'],
        ...tseslint.configs.disableTypeChecked,
    },
    {
        files: ['tools/**/*.ts', 'tools/**/*.mjs', 'tests/**/*.ts', '*.config.ts'],
        languageOptions: { globals: { ...globals.node } },
        rules: { 'security/detect-non-literal-fs-filename': 'off' },
    },
);
