import { assert } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    MIN_USABLE_CARD_NAMES,
    evaluateCardNameIndex,
    findUnsupportedOcrParameters,
    inspectDefaultOcrModel,
    runEnvironmentCheck
} from "../../src/diagnostics/env-check.mjs";
import { DEFAULT_OCR_MODEL_SHA256 } from "../../src/image-analysis/ocr-model.mjs";

describe("diagnostics::env-check", () => {
    let tmpDir;
    let dependencies;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-diagnostics-test-"));
        dependencies = {
            getConfig: () => ({
                storageAdapter: "nedb",
                localCacheEnabled: true,
                collectionEnabled: false,
                debugLogging: false,
                queryingEnabled: false,
                prettyLogging: true
            }),
            resolveDbFilename: () => path.join(tmpDir, "cardNames.db"),
            getCardNameRecords: async () => [],
            secureConfigPath: path.join(tmpDir, "secure.config.cjs")
        };
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const runCheck = (options) => runEnvironmentCheck(options, dependencies);

    it("reports a normalized, deduplicated card-name index as healthy", () => {
        const records = Array.from({ length: MIN_USABLE_CARD_NAMES }, (_, index) => ({
            name: `Card ${index}`
        }));

        const result = evaluateCardNameIndex(records);

        assert.equal(result.status, "pass");
        assert.isTrue(result.required);
        assert.deepEqual(result.health, {
            totalRows: MIN_USABLE_CARD_NAMES,
            validRows: MIN_USABLE_CARD_NAMES,
            uniqueNames: MIN_USABLE_CARD_NAMES,
            invalidRows: 0,
            duplicateRows: 0
        });
    });

    it("fails an underscore-only index even though it contains rows", () => {
        const result = evaluateCardNameIndex([{ name: "_____ // ______" }]);

        assert.equal(result.status, "fail");
        assert.isTrue(result.required);
        assert.include(result.label, "0 unique matchable names");
        assert.equal(result.health.invalidRows, 1);
    });

    it("warns when an otherwise usable index contains invalid or duplicate rows", () => {
        const records = Array.from({ length: MIN_USABLE_CARD_NAMES }, (_, index) => ({
            name: `Card ${index}`
        }));
        records.push({ name: "Card 0" }, { name: "_____" });

        const result = evaluateCardNameIndex(records);

        assert.equal(result.status, "fail");
        assert.isFalse(result.required);
        assert.include(result.label, "1 invalid rows, 1 duplicate rows");
    });

    it("returns checks/requiredFailures/warnings with no unhandled rejection", async () => {
        const result = await runCheck();

        assert.isArray(result.checks);
        assert.isNotEmpty(result.checks);
        assert.isNumber(result.requiredFailures);
        assert.isArray(result.warnings);
        if (result.cardNameIndex) {
            assert.hasAllKeys(result.cardNameIndex, [
                "totalRows",
                "validRows",
                "uniqueNames",
                "invalidRows",
                "duplicateRows"
            ]);
        }
        result.checks.forEach((check) => {
            assert.hasAllKeys(check, ["label", "status"]);
            assert.include(["pass", "fail"], check.status);
        });
    });

    it("checks Node version against the >=22.14 floor", async () => {
        const result = await runCheck();
        const nodeCheck = result.checks.find((check) => check.label.startsWith("Node "));
        assert.exists(nodeCheck);
        assert.equal(nodeCheck.status, "pass", "this test suite itself requires Node >=22.14");
    });

    it("checks the pinned official LSTM English model used at runtime", async () => {
        const result = await runCheck();
        const modelCheck = result.checks.find((check) =>
            check.label.startsWith("English OCR model")
        );

        assert.exists(modelCheck);
        assert.equal(modelCheck.status, "pass");
        assert.include(modelCheck.label, "official tessdata_best LSTM");
    });

    it("rejects model bytes that do not match the pinned production SHA-256", () => {
        const inspection = inspectDefaultOcrModel(Buffer.from("unexpected model"));

        assert.equal(inspection.expectedSha256, DEFAULT_OCR_MODEL_SHA256);
        assert.notEqual(inspection.sha256, inspection.expectedSha256);
        assert.isFalse(inspection.matchesExpectedSha256);
        assert.deepEqual(inspection.unsupportedParameters, []);
    });

    it("detects the obsolete parameters that cause Tesseract warning noise", () => {
        const modelConfig = Buffer.from("enable_new_segsearch 0\nsave_raw_choices 1\n");

        assert.deepEqual(findUnsupportedOcrParameters(modelConfig), [
            "enable_new_segsearch",
            "save_raw_choices"
        ]);
    });

    it("reports the resolved config (storageAdapter/localCacheEnabled/collectionEnabled/debugLogging/queryingEnabled/prettyLogging)", async () => {
        const result = await runCheck();
        const labels = result.checks.map((check) => check.label);
        assert.isTrue(labels.some((label) => label.startsWith("storageAdapter")));
        assert.isTrue(labels.some((label) => label.startsWith("localCacheEnabled")));
        assert.isTrue(labels.some((label) => label.startsWith("collectionEnabled")));
        assert.isTrue(labels.some((label) => label.startsWith("debugLogging")));
        assert.isTrue(labels.some((label) => label.startsWith("queryingEnabled")));
        assert.isTrue(labels.some((label) => label.startsWith("prettyLogging")));
    });

    it("skips the MySQL check by default (withMysql: false)", async () => {
        const result = await runCheck();
        const labels = result.checks.map((check) => check.label);
        assert.isFalse(labels.some((label) => label.includes("MySQL")));
    });

    it("reports the injected missing secure config when withMysql is true", async () => {
        const result = await runCheck({ withMysql: true });
        const labels = result.checks.map((check) => check.label);
        assert.isTrue(labels.some((label) => label.includes("secure.config.cjs not found")));
    });

    it("uses the injected MySQL connection boundary when secure config exists", async () => {
        fs.writeFileSync(dependencies.secureConfigPath, "fixture only\n");
        let connectionEnded = false;
        dependencies.createConnection = async () => ({
            end: async () => {
                connectionEnded = true;
            }
        });

        const result = await runCheck({ withMysql: true });
        const mysqlCheck = result.checks.find((check) => check.label.includes("MySQL"));

        assert.deepEqual(mysqlCheck, { label: "MySQL connection succeeded", status: "pass" });
        assert.isTrue(connectionEnded);
    });
});
