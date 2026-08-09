import { rejects } from "node:assert/strict";
import { assert } from "chai";
import { buildProgram, main } from "../../scripts/promote-ocr-training-review.mjs";

describe("promote-ocr-training-review CLI", () => {
    it("parses approved, positively noted, concerned, and rejected decisions", () => {
        const options = buildProgram("/repo")
            .parse([
                "node",
                "promote-ocr-training-review.mjs",
                "--batch-dir",
                "/review/batch-001",
                "--approve",
                "adanto",
                "--approve-note",
                "spellseeker=This is a really good copy",
                "--concern",
                "attunement=Approved but lower contrast",
                "--reject",
                "mindstab"
            ])
            .opts();

        assert.deepEqual(options.approve, ["adanto"]);
        assert.deepEqual(options.approveNote, [
            { id: "spellseeker", notes: "This is a really good copy" }
        ]);
        assert.deepEqual(options.concern, [
            { id: "attunement", concern: "Approved but lower contrast" }
        ]);
        assert.deepEqual(options.reject, ["mindstab"]);
    });

    it("passes the exact decision partition to the promoter", async () => {
        let received;
        const lines = [];

        const result = await main(
            [
                "node",
                "promote-ocr-training-review.mjs",
                "--batch-dir",
                "/review/batch-001",
                "--approve",
                "adanto",
                "--approve-note",
                "spellseeker=This is a really good copy",
                "--concern",
                "attunement=Approved but lower contrast",
                "--reject",
                "mindstab"
            ],
            {
                repositoryRoot: "/repo",
                promoteTrainingReviewBatch: async (options) => {
                    received = options;
                    return {
                        approved: ["adanto", "spellseeker", "attunement"],
                        rejected: ["mindstab"],
                        trainingManifestPath: "/repo/training/ocr/manifest.json"
                    };
                },
                writeLine: (line) => lines.push(line)
            }
        );

        assert.deepEqual(received, {
            reviewManifestPath: "/review/batch-001/review-manifest.json",
            trainingManifestPath: "/repo/training/ocr/manifest.json",
            approved: [
                { id: "adanto" },
                { id: "spellseeker", notes: "This is a really good copy" },
                { id: "attunement", concern: "Approved but lower contrast" }
            ],
            rejectedIds: ["mindstab"]
        });
        assert.equal(result.approved.length, 3);
        assert.include(lines, "Promoted 3 reviewed sample(s); rejected 1");
    });

    it("rejects a sample listed as both approved and concerned", async () => {
        await rejects(
            main(
                [
                    "node",
                    "promote-ocr-training-review.mjs",
                    "--batch-dir",
                    "/review/batch-001",
                    "--approve",
                    "attunement",
                    "--concern",
                    "attunement=concern"
                ],
                { repositoryRoot: "/repo" }
            ),
            /cannot appear in more than one approval option/
        );
    });
});
