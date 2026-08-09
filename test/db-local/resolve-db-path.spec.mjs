import { assert } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    toDbFilePath,
    canUsePath,
    resolveDbFilename
} from "../../src/db-local/resolve-db-path.mjs";

describe("db-local::resolve-db-path", () => {
    describe("toDbFilePath::", () => {
        it("returns an empty string when no base path is given", () => {
            assert.equal(toDbFilePath("", "names.db"), "");
            assert.equal(toDbFilePath(undefined, "names.db"), "");
        });

        it("passes an explicit .db file path through unchanged", () => {
            assert.equal(toDbFilePath("/data/custom.db", "names.db"), "/data/custom.db");
        });

        it("detects the .db extension case-insensitively", () => {
            assert.equal(toDbFilePath("/data/custom.DB", "names.db"), "/data/custom.DB");
        });

        it("joins a directory base path with the default filename", () => {
            assert.equal(toDbFilePath("/data/dir", "names.db"), path.join("/data/dir", "names.db"));
        });
    });

    describe("canUsePath::", () => {
        const temporaryDirectories = [];

        afterEach(() => {
            temporaryDirectories.splice(0).forEach((directory) => {
                fs.rmSync(directory, { recursive: true, force: true });
            });
        });

        it("returns false for an empty path", () => {
            assert.isFalse(canUsePath(""));
        });

        it("returns true for a file path whose directory is creatable and writable", () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), "resolve-db-path-test-"));
            temporaryDirectories.push(directory);

            assert.isTrue(canUsePath(path.join(directory, "nested", "names.db")));
        });

        it("returns false when the path is unusable (e.g. contains a null byte)", () => {
            assert.isFalse(canUsePath(`${os.tmpdir()}/bad\0path/names.db`));
        });
    });

    describe("resolveDbFilename::", () => {
        const temporaryDirectories = [];

        afterEach(() => {
            temporaryDirectories.splice(0).forEach((directory) => {
                fs.rmSync(directory, { recursive: true, force: true });
            });
        });

        it("uses an explicit .db file path as-is when its directory is usable", () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), "resolve-db-path-test-"));
            temporaryDirectories.push(directory);
            const preferredPath = path.join(directory, "custom.db");

            assert.equal(resolveDbFilename(preferredPath, "names.db"), preferredPath);
        });

        it("joins a preferred directory with the default filename", () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), "resolve-db-path-test-"));
            temporaryDirectories.push(directory);

            assert.equal(
                resolveDbFilename(directory, "names.db"),
                path.join(directory, "names.db")
            );
        });
    });
});
