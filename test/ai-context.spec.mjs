import { expect } from "chai";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
    ensureSymlink,
    evaluatePin,
    getAiCentralSelection,
    resolveAiCentralLayout
} from "../scripts/setup-ai-context.mjs";

describe("AI Central setup", () => {
    it("selects the repository's OpenTofu steering and skill bundle", () => {
        expect(getAiCentralSelection()).to.deep.equal({
            profiles: ["base", "javascript-typescript", "infrastructure-opentofu"],
            bundles: ["core", "brevity", "engineering", "planning", "infra", "workflow"]
        });
    });

    it("accepts either the AI Central root or templates directory", () => {
        expect(resolveAiCentralLayout("/tmp/example/ai-central", "/tmp/project")).to.deep.equal({
            aiCentralRoot: "/tmp/example/ai-central",
            templatesRoot: "/tmp/example/ai-central/templates"
        });
        expect(
            resolveAiCentralLayout("/tmp/example/ai-central/templates", "/tmp/project")
        ).to.deep.equal({
            aiCentralRoot: "/tmp/example/ai-central",
            templatesRoot: "/tmp/example/ai-central/templates"
        });
    });

    it("classifies pin state", () => {
        expect(evaluatePin({ expectedCommit: null }, "abc").status).to.equal("unpinned");
        expect(evaluatePin({ expectedCommit: "abc" }, undefined).status).to.equal("not-git");
        expect(evaluatePin({ expectedCommit: "abc" }, "abc", { dirty: true }).status).to.equal(
            "dirty"
        );
        expect(evaluatePin({ expectedCommit: "abc" }, "def").status).to.equal("mismatch");
        expect(evaluatePin({ expectedCommit: "abc" }, "abc").status).to.equal("ok");
    });

    it("creates, preserves, and repairs managed symlinks", async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), "mtg-ai-context-"));
        try {
            const firstTarget = path.join(root, "first");
            const secondTarget = path.join(root, "second");
            const linkPath = path.join(root, "nested", "skill");
            await fs.mkdir(firstTarget);
            await fs.mkdir(secondTarget);

            expect((await ensureSymlink(linkPath, firstTarget)).action).to.equal("created");
            expect((await ensureSymlink(linkPath, firstTarget)).action).to.equal("unchanged");
            expect((await ensureSymlink(linkPath, secondTarget)).action).to.equal("updated");
            expect(path.resolve(path.dirname(linkPath), await fs.readlink(linkPath))).to.equal(
                secondTarget
            );

            await fs.unlink(linkPath);
            await fs.writeFile(linkPath, "repo-owned\n");
            expect((await ensureSymlink(linkPath, firstTarget)).action).to.equal("preserved");
            expect(await fs.readFile(linkPath, "utf8")).to.equal("repo-owned\n");
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });
});
