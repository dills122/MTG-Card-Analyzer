import { assert } from "chai";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    loadOcrModelManifest,
    validateOcrModelManifest
} from "../../src/regression/ocr-model-candidate.mjs";

function candidate(overrides = {}) {
    return {
        id: "bundled-eng-control",
        model: "models/control/eng.traineddata",
        family: "combined",
        sha256: "a".repeat(64),
        source: {
            url: "https://github.com/dills122/MTG-Card-Analyzer",
            revision: "dcc5d0e",
            license: "Apache-2.0"
        },
        engine: {
            package: "tesseract.js",
            version: "3.0.3"
        },
        ...overrides
    };
}

describe("OCR model candidate manifest::", () => {
    let directory;

    afterEach(async () => {
        if (directory) {
            await rm(directory, { recursive: true, force: true });
            directory = undefined;
        }
    });

    it("resolves a versioned candidate with explicit provenance", () => {
        const manifestPath = "/fixtures/ocr-models/manifest.json";
        const manifest = validateOcrModelManifest(
            { version: 1, candidates: [candidate()] },
            manifestPath
        );

        assert.equal(manifest.path, manifestPath);
        assert.equal(manifest.candidates[0].id, "bundled-eng-control");
        assert.equal(
            manifest.candidates[0].modelPath,
            "/fixtures/ocr-models/models/control/eng.traineddata"
        );
        assert.equal(manifest.candidates[0].languagePath, "/fixtures/ocr-models/models/control");
        assert.equal(manifest.candidates[0].source.license, "Apache-2.0");
        assert.equal(manifest.candidates[0].engine.version, "3.0.3");
    });

    it("tracks the pinned official LSTM model as the bundled control candidate", async () => {
        const manifestPath = fileURLToPath(new URL("./ocr-models/manifest.json", import.meta.url));

        const manifest = await loadOcrModelManifest(manifestPath);

        assert.equal(manifest.candidates.length, 1);
        assert.include(manifest.candidates[0], {
            id: "bundled-eng-control",
            family: "tessdata_best",
            sha256: "8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba",
            sizeBytes: 15400601
        });
        assert.equal(
            manifest.candidates[0].source.revision,
            "e12c65a915945e4c28e237a9b52bc4a8f39a0cec"
        );
    });

    it("rejects duplicate candidate IDs and non-English model filenames", () => {
        assert.throws(
            () =>
                validateOcrModelManifest(
                    { version: 1, candidates: [candidate(), candidate()] },
                    "/fixtures/manifest.json"
                ),
            "Duplicate OCR model candidate id"
        );
        assert.throws(
            () =>
                validateOcrModelManifest(
                    {
                        version: 1,
                        candidates: [candidate({ model: "models/control/custom.traineddata" })]
                    },
                    "/fixtures/manifest.json"
                ),
            "must be named eng.traineddata"
        );
    });

    it("loads a candidate only when its bytes match the reviewed SHA-256", async () => {
        directory = await mkdtemp(path.join(os.tmpdir(), "mtg-ocr-model-manifest-"));
        const modelDirectory = path.join(directory, "models/control");
        const modelPath = path.join(modelDirectory, "eng.traineddata");
        const modelBytes = Buffer.from("reviewed OCR model bytes");
        await mkdir(modelDirectory, { recursive: true });
        await writeFile(modelPath, modelBytes);
        const sha256 = createHash("sha256").update(modelBytes).digest("hex");
        const manifestPath = path.join(directory, "manifest.json");
        await writeFile(
            manifestPath,
            JSON.stringify({
                version: 1,
                candidates: [candidate({ model: "models/control/eng.traineddata", sha256 })]
            })
        );

        const manifest = await loadOcrModelManifest(manifestPath);

        assert.equal(manifest.candidates[0].sha256, sha256);
        assert.equal(manifest.candidates[0].sizeBytes, modelBytes.length);
    });

    it("rejects model bytes that do not match the reviewed SHA-256", async () => {
        directory = await mkdtemp(path.join(os.tmpdir(), "mtg-ocr-model-manifest-"));
        const modelDirectory = path.join(directory, "models/control");
        await mkdir(modelDirectory, { recursive: true });
        await writeFile(path.join(modelDirectory, "eng.traineddata"), "unexpected bytes");
        const manifestPath = path.join(directory, "manifest.json");
        await writeFile(
            manifestPath,
            JSON.stringify({
                version: 1,
                candidates: [candidate({ model: "models/control/eng.traineddata" })]
            })
        );

        let error;
        try {
            await loadOcrModelManifest(manifestPath);
        } catch (caught) {
            error = caught;
        }
        assert.instanceOf(error, Error);
        assert.include(
            error.message,
            "SHA-256 mismatch for OCR model candidate bundled-eng-control"
        );
    });
});
