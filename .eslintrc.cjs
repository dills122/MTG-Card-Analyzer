module.exports = {
    root: true,
    env: {
        node: true,
        es2021: true,
        mocha: true
    },
    extends: ["eslint:recommended", "prettier"],
    parserOptions: {
        ecmaVersion: 2021,
        sourceType: "script"
    },
    overrides: [
        {
            files: ["**/*.mjs"],
            parserOptions: {
                sourceType: "module"
            }
        }
    ],
    rules: {
        "no-console": "off"
    }
};
