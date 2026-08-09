import ProcessorApi, { create, ProcessorClass } from "./processor.mjs";

export const Processor = ProcessorApi;
export { create, ProcessorClass };

export default {
    Processor: ProcessorApi,
    create,
    ProcessorClass
};
