import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { run } from "../../index.mjs";
import processorModule from "../../src/processor/index.mjs";
import storage from "../../src/storage/index.mjs";

const [, , mode, root, inputPath] = process.argv;
const scanDirectory = path.join(root, "scan-temp");

const fileIO = {
    async createDirectory() {
        await mkdir(scanDirectory);
        await writeFile(path.join(scanDirectory, "ocr-snippet.txt"), "temporary OCR data");
        return scanDirectory;
    },
    cleanUpFiles(directory) {
        return rm(directory, { recursive: true, force: true });
    }
};

const imageProcessor = {
    create({ directory }) {
        return {
            imagePath: path.join(directory, "name.png"),
            extract(callback) {
                callback(null, {
                    cleanText: "Pacifism",
                    dirtyText: "Pacifism",
                    textCandidates: ["Pacifism"]
                });
            }
        };
    }
};

const matchName = {
    create() {
        return {
            matchedText: "Pacifism",
            async match() {
                return [{ name: "Pacifism", percentage: 1 }];
            }
        };
    }
};

const matchProcessor = {
    create() {
        return {
            matchResultDetails: [],
            async executeAsync() {
                if (mode === "failure") {
                    throw new Error("fixture matching failure");
                }
                await storage.hashes.upsert({
                    cardName: "Pacifism",
                    setName: "Core Set 2020",
                    cardHash: "fixture-hash",
                    hashMode: "full-card"
                });
                return ["Core Set 2020"];
            }
        };
    }
};

await run({
    argv: ["scan", inputPath],
    commanderFactory: async () => ({
        command: "scan",
        filePath: inputPath,
        flags: {
            cardNamesDb: root,
            cardHashDb: root,
            query: false,
            pretty: false,
            enableCollection: false,
            debug: false,
            localCache: true,
            _localCacheExplicit: true
        }
    }),
    processorFactory: (params) =>
        processorModule.Processor.create({
            ...params,
            dependencies: {
                imageProcessor,
                fileIO,
                matchName,
                matchProcessor,
                storage
            }
        }),
    ocrShutdown: async () => {},
    exit: (code) => process.exit(code)
});
