import { ProcessHashes as ProcessHashesClass, create, dependencies } from "./process-hashes.mjs";

export const ProcessHashes = ProcessHashesClass;
export { create, dependencies };

export default {
    ProcessHashes: ProcessHashesClass,
    create,
    dependencies
};
