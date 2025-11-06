"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const deepCamelizeKeys_1 = __importDefault(require("./deepCamelizeKeys"));
const pluralize_1 = __importDefault(require("pluralize"));
const lodash_1 = __importDefault(require("lodash"));
const uuid_1 = require("uuid");
function diffSeconds(dt2, dt1) {
    var diff = (dt2.getTime() - dt1.getTime()) / 1000;
    return Math.abs(Math.round(diff));
}
function createPayloadHandler({ dispatch, serverActionQueue, transportAdapter, config }) {
    const subscriptionId = uuid_1.v4();
    let idx = {};
    let patchQueue = {};
    let lastCheckAt = new Date();
    let updateDeadline = null;
    let checkInterval;
    let midSyncTimeout;
    function getPayload() {
        setTimeout(() => transportAdapter.getPayload(config), 1000);
    }
    function camelizeKeys(item) {
        return deepCamelizeKeys_1.default(item, key => uuid_1.validate(key));
    }
    const tGetPayload = lodash_1.default.throttle(getPayload, 10000);
    function processQueue(model) {
        if (midSyncTimeout) {
            clearTimeout(midSyncTimeout);
        }
        console.debug("processQueue", model, idx[model], patchQueue[model]);
        lastCheckAt = new Date();
        if (patchQueue[model][idx[model]]) {
            if (!serverActionQueue.fullySynced()) {
                console.debug(serverActionQueue.getData());
                midSyncTimeout = setTimeout(() => processQueue(model), 100);
                return;
            }
            const { payload, destroy, id, type } = patchQueue[model][idx[model]];
            if (type === 'payload') {
                dispatch({ type: `${pluralize_1.default(model)}/upsertMany`, payload: payload.map(m => (Object.assign(Object.assign({}, m), { id: String(m.id) }))) });
                const ids = payload.map(instance => instance.id);
                dispatch({ type: `jasonModels/setSubscriptionIds`, payload: { model, subscriptionId, ids } });
            }
            else if (destroy) {
                // Middleware will determine if this model should be removed if it isn't in any other subscriptions
                dispatch({ type: `jasonModels/removeSubscriptionId`, payload: { model, subscriptionId, id } });
            }
            else {
                dispatch({ type: `${pluralize_1.default(model)}/upsert`, payload: Object.assign(Object.assign({}, payload), { id: String(payload.id) }) });
                dispatch({ type: `jasonModels/addSubscriptionId`, payload: { model, subscriptionId, id } });
            }
            delete patchQueue[model][idx[model]];
            idx[model]++;
            updateDeadline = null;
            processQueue(model);
            // If there are updates in the queue that are ahead of the index, some have arrived out of order
            // Set a deadline for new updates before it declares the update missing and refetches.
        }
        else if (lodash_1.default.keys(patchQueue[model]).length > 0 && !updateDeadline) {
            var t = new Date();
            t.setSeconds(t.getSeconds() + 3);
            updateDeadline = t;
            setTimeout(() => processQueue(model), 3100);
            // If more than 10 updates in queue, or deadline has passed, restart
        }
        else if (lodash_1.default.keys(patchQueue[model]).length > 10 || (updateDeadline && diffSeconds(updateDeadline, new Date()) < 0)) {
            tGetPayload();
            updateDeadline = null;
        }
    }
    function handlePayload(data) {
        const { idx: newIdx, model: snake_model, type } = data;
        const model = lodash_1.default.camelCase(snake_model);
        idx[model] = idx[model] || 0;
        patchQueue[model] = patchQueue[model] || {};
        if (type === 'payload') {
            idx[model] = newIdx;
            // Clear any old changes left in the queue
            patchQueue[model] = lodash_1.default.pick(patchQueue[model], lodash_1.default.keys(patchQueue[model]).filter(k => k > newIdx));
        }
        patchQueue[model][newIdx] = camelizeKeys(Object.assign(Object.assign({}, data), { model }));
        console.debug("Added to queue", model, idx[model], camelizeKeys(Object.assign(Object.assign({}, data), { model })), serverActionQueue.getData());
        processQueue(model);
        if (diffSeconds((new Date()), lastCheckAt) >= 3) {
            lastCheckAt = new Date();
            console.debug('Interval lost. Pulling from server');
            tGetPayload();
        }
    }
    tGetPayload();
    // Clean up after ourselves
    function tearDown() {
        dispatch({ type: `jasonModels/removeSubscription`, payload: { subscriptionId } });
    }
    return { handlePayload, tearDown };
}
exports.default = createPayloadHandler;
