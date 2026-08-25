import config from '@iobroker/eslint-config';

export default [
    ...config,
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['*.mjs'],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        ignores: ['node_modules/**/*', 'build/**/*', 'coverage/**/*', 'tmp/**/*', '.**/*'],
    },
    {
        rules: {
            'jsdoc/require-jsdoc': 'off',
        },
    },
    {
        files: ['test/**/*.ts'],
        rules: {
            'jsdoc/require-param': 'off',
            'jsdoc/require-returns': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
];
