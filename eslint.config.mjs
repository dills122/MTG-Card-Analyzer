import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
    {
        ignores: [
            "node_modules/**",
            "dist/**",
            "coverage/**",
            ".claude/worktrees/**",
            ".codex/skills/**"
        ]
    },
    {
        files: ["**/*.mjs", "**/*.js"],
        languageOptions: {
            ...js.configs.recommended.languageOptions,
            sourceType: "module",
            globals: {
                ...globals.node,
                ...globals.mocha
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            "no-console": "off"
        }
    },
    {
        files: ["**/*.cjs"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "commonjs",
            globals: {
                ...globals.node
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            "no-console": "off"
        }
    },
    prettier
];
