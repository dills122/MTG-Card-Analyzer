import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { rejects } from "node:assert/strict";
import { assert } from "chai";
import {
    assertTrainingDataReady,
    loadTrainingDataManifest,
    validateTrainingDataManifest
} from "../../src/training/training-data-manifest.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function baseManifest(overrides = {}) {
    return {
        version: 1,
        status: "draft",
        modelName: "eng_mtg",
        randomSeed: 20260808,
        trainRatio: 0.9,
        baseModel: {
            id: "official-eng-best",
            family: "tessdata_best",
            sha256: "8".repeat(64),
            source: {
                url: "https://github.com/tesseract-ocr/tessdata_best",
                revision: "e12c65a915945e4c28e237a9b52bc4a8f39a0cec",
                license: "Apache-2.0"
            }
        },
        samples: [],
        ...overrides
    };
}

function validSample(id = "sample") {
    return {
        id,
        image: `${id}.png`,
        transcription: `${id}.gt.txt`,
        imageSha256: "1".repeat(64),
        transcriptionSha256: "2".repeat(64),
        reviewed: true,
        source: {
            kind: "card-image",
            reference: `fixture:${id}`,
            license: "fixture-reviewed"
        }
    };
}

describe("OCR training-data manifest", () => {
    it("accepts an empty draft with a pinned tessdata_best base", () => {
        const manifestPath = "/repo/training/ocr/manifest.json";

        const manifest = validateTrainingDataManifest(baseManifest(), manifestPath);

        assert.equal(manifest.path, manifestPath);
        assert.equal(manifest.baseModel.family, "tessdata_best");
        assert.deepEqual(manifest.samples, []);
    });

    it("loads reviewed single-line image/transcription pairs and verifies their hashes", async () => {
        const directory = await mkdtemp(path.join(os.tmpdir(), "mtg-training-data-"));
        try {
            const image = Buffer.from("fake png bytes");
            const firstText = "Sarkhan Unbroken";
            const secondText = "Yavimaya Coast";
            await writeFile(path.join(directory, "sarkhan.png"), image);
            await writeFile(path.join(directory, "sarkhan.gt.txt"), firstText);
            await writeFile(path.join(directory, "yavimaya.png"), image);
            await writeFile(path.join(directory, "yavimaya.gt.txt"), secondText);
            const manifestPath = path.join(directory, "manifest.json");
            const sample = (id, text) => ({
                id,
                image: `${id}.png`,
                transcription: `${id}.gt.txt`,
                imageSha256: sha256(image),
                transcriptionSha256: sha256(text),
                reviewed: true,
                source: {
                    kind: "card-image",
                    reference: `fixture:${id}`,
                    license: "fixture-reviewed"
                }
            });
            await writeFile(
                manifestPath,
                JSON.stringify(
                    baseManifest({
                        status: "reviewed",
                        samples: [sample("sarkhan", firstText), sample("yavimaya", secondText)]
                    })
                )
            );

            const manifest = await loadTrainingDataManifest(manifestPath);
            const readiness = assertTrainingDataReady(manifest);

            assert.equal(manifest.samples[0].text, firstText);
            assert.equal(manifest.samples[1].text, secondText);
            assert.deepEqual(readiness, { total: 2, train: 1, evaluation: 1 });
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it("rejects a transcription that is not single-line plain text", async () => {
        const directory = await mkdtemp(path.join(os.tmpdir(), "mtg-training-data-"));
        try {
            const image = Buffer.from("fake png bytes");
            const text = "Sarkhan\nUnbroken";
            await writeFile(path.join(directory, "sarkhan.png"), image);
            await writeFile(path.join(directory, "sarkhan.gt.txt"), text);
            const manifestPath = path.join(directory, "manifest.json");
            await writeFile(
                manifestPath,
                JSON.stringify(
                    baseManifest({
                        samples: [
                            {
                                id: "sarkhan",
                                image: "sarkhan.png",
                                transcription: "sarkhan.gt.txt",
                                imageSha256: sha256(image),
                                transcriptionSha256: sha256(text),
                                reviewed: true,
                                source: {
                                    kind: "card-image",
                                    reference: "fixture:sarkhan",
                                    license: "fixture-reviewed"
                                }
                            }
                        ]
                    })
                )
            );

            await rejects(
                loadTrainingDataManifest(manifestPath),
                /must contain exactly one non-empty line/
            );
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it("rejects checksum drift and paths outside the manifest directory", async () => {
        const directory = await mkdtemp(path.join(os.tmpdir(), "mtg-training-data-"));
        try {
            const image = Buffer.from("fake png bytes");
            const text = "Pacifism";
            await writeFile(path.join(directory, "pacifism.png"), image);
            await writeFile(path.join(directory, "pacifism.gt.txt"), text);
            const sample = {
                id: "pacifism",
                image: "pacifism.png",
                transcription: "pacifism.gt.txt",
                imageSha256: "0".repeat(64),
                transcriptionSha256: sha256(text),
                reviewed: true,
                source: {
                    kind: "card-image",
                    reference: "fixture:pacifism",
                    license: "fixture-reviewed"
                }
            };
            const manifestPath = path.join(directory, "manifest.json");
            await writeFile(manifestPath, JSON.stringify(baseManifest({ samples: [sample] })));

            await rejects(
                loadTrainingDataManifest(manifestPath),
                /SHA-256 mismatch for training image pacifism/
            );
            assert.throws(
                () =>
                    validateTrainingDataManifest(
                        baseManifest({
                            samples: [
                                {
                                    ...sample,
                                    image: "../outside.png",
                                    transcription: "../outside.gt.txt"
                                }
                            ]
                        }),
                        manifestPath
                    ),
                "must stay inside the manifest directory"
            );
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it("rejects malformed training metadata before reading sample files", () => {
        const manifestPath = "/repo/training/ocr/manifest.json";
        const baseModel = baseManifest().baseModel;
        const cases = [
            [baseManifest({ status: "ready" }), "status must be draft or reviewed"],
            [baseManifest({ modelName: "Bad Name" }), "modelName must use lowercase"],
            [baseManifest({ randomSeed: -1 }), "randomSeed must be a non-negative safe integer"],
            [
                baseManifest({ trainRatio: 1 }),
                "trainRatio must be a number greater than 0 and less than 1"
            ],
            [
                baseManifest({ baseModel: { ...baseModel, family: "tessdata_fast" } }),
                "baseModel.family must be tessdata_best"
            ],
            [
                baseManifest({
                    baseModel: {
                        ...baseModel,
                        source: { ...baseModel.source, url: "http://example.com/model" }
                    }
                }),
                "baseModel.source.url must use HTTPS"
            ],
            [
                baseManifest({ samples: [{ ...validSample(), id: "Bad Sample" }] }),
                "samples[0].id must use lowercase"
            ],
            [
                baseManifest({ samples: [{ ...validSample(), reviewed: "yes" }] }),
                "samples[0].reviewed must be a boolean"
            ],
            [
                baseManifest({
                    samples: [
                        {
                            ...validSample(),
                            source: { ...validSample().source, kind: "unknown" }
                        }
                    ]
                }),
                "samples[0].source.kind must be card-image or synthetic"
            ],
            [
                baseManifest({
                    samples: [
                        {
                            ...validSample(),
                            image: "sample.jpg",
                            transcription: "sample.gt.txt"
                        }
                    ]
                }),
                "samples[0].image must be a .png or .tif"
            ],
            [
                baseManifest({
                    samples: [{ ...validSample(), transcription: "different.gt.txt" }]
                }),
                "samples[0].transcription must replace the image extension"
            ],
            [
                baseManifest({ samples: [validSample(), validSample()] }),
                "Duplicate training sample id: sample"
            ]
        ];

        cases.forEach(([manifest, message]) => {
            assert.throws(() => validateTrainingDataManifest(manifest, manifestPath), message);
        });
    });

    it("rejects missing files and transcription checksum drift", async () => {
        const directory = await mkdtemp(path.join(os.tmpdir(), "mtg-training-data-"));
        try {
            const manifestPath = path.join(directory, "manifest.json");
            await writeFile(path.join(directory, "missing.gt.txt"), "Missing");
            await writeFile(
                manifestPath,
                JSON.stringify(baseManifest({ samples: [validSample("missing")] }))
            );
            await rejects(
                loadTrainingDataManifest(manifestPath),
                /Training image missing does not exist/
            );

            const image = Buffer.from("fake png bytes");
            const text = "Pacifism";
            await writeFile(path.join(directory, "pacifism.png"), image);
            await writeFile(path.join(directory, "pacifism.gt.txt"), text);
            await writeFile(
                manifestPath,
                JSON.stringify(
                    baseManifest({
                        samples: [
                            {
                                ...validSample("pacifism"),
                                imageSha256: sha256(image),
                                transcriptionSha256: "0".repeat(64)
                            }
                        ]
                    })
                )
            );

            await rejects(
                loadTrainingDataManifest(manifestPath),
                /SHA-256 mismatch for training transcription pacifism/
            );
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it("rejects invalid UTF-8 and non-NFC transcriptions", async () => {
        const directory = await mkdtemp(path.join(os.tmpdir(), "mtg-training-data-"));
        try {
            const image = Buffer.from("fake png bytes");
            const manifestPath = path.join(directory, "manifest.json");
            const writeCase = async (id, transcription) => {
                await writeFile(path.join(directory, `${id}.png`), image);
                await writeFile(path.join(directory, `${id}.gt.txt`), transcription);
                await writeFile(
                    manifestPath,
                    JSON.stringify(
                        baseManifest({
                            samples: [
                                {
                                    ...validSample(id),
                                    imageSha256: sha256(image),
                                    transcriptionSha256: sha256(transcription)
                                }
                            ]
                        })
                    )
                );
            };

            await writeCase("invalid-utf8", Buffer.from([0xc3, 0x28]));
            await rejects(loadTrainingDataManifest(manifestPath), /must be valid UTF-8/);

            await writeCase("non-nfc", "Cafe\u0301");
            await rejects(
                loadTrainingDataManifest(manifestPath),
                /must use NFC Unicode normalization/
            );
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it("does not mark drafts or unreviewed samples as training-ready", () => {
        const manifestPath = "/repo/training/ocr/manifest.json";
        const draft = validateTrainingDataManifest(baseManifest(), manifestPath);
        const unreviewed = validateTrainingDataManifest(
            baseManifest({
                status: "reviewed",
                samples: [
                    {
                        id: "sample",
                        image: "sample.png",
                        transcription: "sample.gt.txt",
                        imageSha256: "1".repeat(64),
                        transcriptionSha256: "2".repeat(64),
                        reviewed: false,
                        source: {
                            kind: "card-image",
                            reference: "fixture:sample",
                            license: "fixture-reviewed"
                        }
                    }
                ]
            }),
            manifestPath
        );

        assert.throws(() => assertTrainingDataReady(draft), "status must be reviewed");
        assert.throws(() => assertTrainingDataReady(unreviewed), "contains unreviewed samples");
        assert.throws(
            () =>
                assertTrainingDataReady(
                    validateTrainingDataManifest(
                        baseManifest({
                            status: "reviewed",
                            trainRatio: 0.1,
                            samples: [validSample("one"), validSample("two")]
                        }),
                        manifestPath
                    )
                ),
            "ratio must produce at least one train and evaluation sample"
        );
    });
});
