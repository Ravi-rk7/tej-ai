import js from '@eslint/js';
import globals from 'globals';

export default [
    {
        ignores: ['coverage/**', 'logs/**', 'node_modules/**'],
    },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.es2024,
            },
        },
        rules: {
            'no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],
            'no-console': ['error', { allow: ['warn', 'error'] }],
        },
    },
    {
        files: ['scripts/**/*.js'],
        rules: {
            'no-console': 'off',
        },
    },
];
