import ProcessorApi, { create, dependencies, ProcessorClass } from "./processor.mjs";

export const Processor = ProcessorApi;
export { create, dependencies, ProcessorClass };

export default {
    Processor: ProcessorApi,
    create,
    dependencies,
    ProcessorClass
};
