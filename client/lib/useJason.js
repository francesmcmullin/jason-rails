"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const createActions_1 = __importDefault(require("./createActions"));
const createJasonReducers_1 = __importDefault(require("./createJasonReducers"));
const createPayloadHandler_1 = __importDefault(require("./createPayloadHandler"));
const createOptDis_1 = __importDefault(require("./createOptDis"));
const createServerActionQueue_1 = __importDefault(require("./createServerActionQueue"));
const restClient_1 = __importDefault(require("./restClient"));
const pruneIdsMiddleware_1 = __importDefault(require("./pruneIdsMiddleware"));
const createTransportAdapter_1 = __importDefault(require("./createTransportAdapter"));
const toolkit_1 = require("@reduxjs/toolkit");
const humps_1 = require("humps");
const blueimp_md5_1 = __importDefault(require("blueimp-md5"));
const lodash_1 = __importDefault(require("lodash"));
const react_1 = require("react");
function useJason({ reducers, middleware = [], enhancers = [], transportOptions = {}, extraActions }) {
    const [store, setStore] = react_1.useState(null);
    const [value, setValue] = react_1.useState(null);
    react_1.useEffect(() => {
        restClient_1.default.get('/jason/api/config')
            .then(({ data: jasonConfig }) => {
            const { schema: snakey_schema } = jasonConfig;
            const schema = humps_1.camelizeKeys(snakey_schema);
            console.debug({ schema });
            const serverActionQueue = createServerActionQueue_1.default();
            const allReducers = Object.assign(Object.assign({}, reducers), createJasonReducers_1.default(schema));
            console.debug({ allReducers });
            const store = toolkit_1.configureStore({ reducer: allReducers, middleware: [...middleware, pruneIdsMiddleware_1.default(schema)], enhancers });
            const dispatch = store.dispatch;
            const optDis = createOptDis_1.default(schema, dispatch, restClient_1.default, serverActionQueue);
            const actions = createActions_1.default(schema, store, restClient_1.default, optDis, extraActions);
            let payloadHandlers = {};
            let configs = {};
            let subOptions = {};
            function handlePayload(payload, retry) {
                var _a, _b;
                const { md5Hash } = payload;
                const payloadHandler = (payloadHandlers[md5Hash] || {}).handlePayload;
                if (payloadHandler) {
                    payloadHandler(payload);
                }
                else {
                    if (retry) {
                        console.warn("Payload arrived with no handler, discarding payload " + payload.model + ((_a = payload.payload) === null || _a === void 0 ? void 0 : _a.id), payload, payloadHandlers);
                    }
                    else {
                        console.warn("Payload arrived with no handler, retrying on next tick " + payload.model + ((_b = payload.payload) === null || _b === void 0 ? void 0 : _b.id), payloadHandlers);
                        setTimeout(() => handlePayload(payload, true), 0);
                    }
                }
            }
            const transportAdapter = createTransportAdapter_1.default(jasonConfig, handlePayload, dispatch, () => lodash_1.default.keys(configs).forEach(md5Hash => createSubscription(configs[md5Hash], subOptions[md5Hash])), transportOptions);
            function createSubscription(config, options = {}) {
                // We need the hash to be consistent in Ruby / Javascript
                const hashableConfig = lodash_1.default(Object.assign({ conditions: {}, includes: {} }, config)).toPairs().sortBy(0).fromPairs().value();
                const md5Hash = blueimp_md5_1.default(JSON.stringify(hashableConfig));
                payloadHandlers[md5Hash] = createPayloadHandler_1.default({ dispatch, serverActionQueue, transportAdapter, config });
                configs[md5Hash] = hashableConfig;
                subOptions[md5Hash] = options;
                setTimeout(() => transportAdapter.createSubscription(hashableConfig), 500);
                let pollInterval = null;
                // This is only for debugging / dev - not prod!
                // @ts-ignore
                if (options.pollInterval) {
                    // @ts-ignore
                    pollInterval = setInterval(() => transportAdapter.getPayload(hashableConfig, { forceRefresh: true }), options.pollInterval);
                }
                return {
                    remove() {
                        removeSubscription(hashableConfig);
                        if (pollInterval)
                            clearInterval(pollInterval);
                    },
                    md5Hash
                };
            }
            function removeSubscription(config) {
                var _a;
                transportAdapter.removeSubscription(config);
                const md5Hash = blueimp_md5_1.default(JSON.stringify(config));
                (_a = payloadHandlers[md5Hash]) === null || _a === void 0 ? void 0 : _a.tearDown(); // Race condition where component mounts then unmounts quickly
                delete payloadHandlers[md5Hash];
                delete configs[md5Hash];
                delete subOptions[md5Hash];
            }
            setValue({
                actions: actions,
                subscribe: createSubscription,
                handlePayload
            });
            setStore(store);
        });
    }, []);
    return [store, value];
}
exports.default = useJason;
