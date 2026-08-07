import nedbAdapter from "./adapters/nedb-adapter.mjs";
import rdsAdapter from "./adapters/rds-adapter.mjs";
import { getConfig } from "../config/index.mjs";

const adapterFactories = {
    nedb: nedbAdapter.createNedbAdapter,
    rds: rdsAdapter.createRdsAdapter
};

function createStorage(params = {}) {
    const adapterName = (params.adapterName || getConfig().storageAdapter).toLowerCase();
    const factory = adapterFactories[adapterName] || adapterFactories.nedb;
    return factory();
}

export { createStorage };

export default {
    createStorage
};
