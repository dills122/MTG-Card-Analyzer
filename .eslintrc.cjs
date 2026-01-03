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
    rules: {
        "no-console": "off"
    }
};
