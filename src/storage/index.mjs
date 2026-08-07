import storageFactory from "./create-storage.mjs";

// Resolved lazily on first real use, not at import time. Consumers (match-name.mjs,
// process-hashes.mjs, back-filler.mjs) grab storage.names.getAll / storage.hashes.* at
// their own module-load time, so the wrapper functions below -- not just this module --
// need to defer adapter creation until actually invoked. Otherwise config sourced from
// CLI flags (applied to process.env by index.mjs before the pipeline runs) never takes
// effect, since it's set after every module in the import graph has already loaded.
let adapterInstance;

function getAdapter() {
    if (!adapterInstance) {
        adapterInstance = storageFactory.createStorage();
    }
    return adapterInstance;
}

const storage = {
    get adapterName() {
        return getAdapter().adapterName;
    },
    names: {
        getAll: (...args) => getAdapter().names.getAll(...args)
    },
    hashes: {
        getByCardName: (...args) => getAdapter().hashes.getByCardName(...args),
        upsert: (...args) => getAdapter().hashes.upsert(...args)
    }
};

export { storage };

export default storage;
