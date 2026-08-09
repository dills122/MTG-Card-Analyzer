import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runEnvironmentCheck } from "./env-check.mjs";
import { getConfig } from "../config/index.mjs";
import storage from "../storage/index.mjs";

const packageJsonPath = fileURLToPath(new URL("../../package.json", import.meta.url));
const appVersion = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version;

// Everything a bug report needs, in one shot: environment health, versions, active config,
// and recent scan activity. Nothing sensitive in here -- secrets live only in
// secure.config.cjs, which this never reads. `node index.mjs diagnostics`.
async function gatherDiagnostics({ limit = 20, withMysql = false } = {}, dependencies = {}) {
    const environmentCheck = dependencies.runEnvironmentCheck || runEnvironmentCheck;
    const resolveConfig = dependencies.getConfig || getConfig;
    const dumpOperations = dependencies.dumpOperations || ((options) => storage.log.dump(options));
    const environment = await environmentCheck({ withMysql });
    const config = resolveConfig();

    const recentOperations = (await dumpOperations({ limit })) || [];

    return {
        generatedAt: new Date().toISOString(),
        versions: {
            app: appVersion,
            node: process.versions.node,
            platform: process.platform,
            arch: process.arch
        },
        environment,
        // Everything in the resolved config is safe to share -- MySQL credentials live in
        // secure.config.cjs, a separate file this module never touches.
        config: {
            storageAdapter: config.storageAdapter,
            localCacheEnabled: config.localCacheEnabled,
            collectionEnabled: config.collectionEnabled,
            debugLogging: config.debugLogging,
            queryingEnabled: config.queryingEnabled,
            prettyLogging: config.prettyLogging,
            cardNamesDbPath: config.cardNamesDbPath,
            cardHashDbPath: config.cardHashDbPath,
            configPath: config.configPath
        },
        recentOperations
    };
}

export { gatherDiagnostics };

export default { gatherDiagnostics };
