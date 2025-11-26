"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = __importDefault(require("lodash"));
const pluralize_1 = __importDefault(require("pluralize"));
const uuid_1 = require("uuid");
function enrich(type, payload) {
    if (type.split('/')[1] === 'upsert' && !(type.split('/')[0] === 'session')) {
        if (!payload.id) {
            return Object.assign(Object.assign({}, payload), { id: uuid_1.v4() });
        }
    }
    return payload;
}
function createOptDis(schema, dispatch, restClient, serverActionQueue) {
    const plurals = lodash_1.default.keys(schema).map(k => pluralize_1.default(k));
    function notify() {
        const { queue, inFlight } = serverActionQueue.getData();
        dispatch({ type: 'jason/upsert', payload: { queueSize: queue.length, inFlight } });
    }
    function enqueueServerAction(action) {
        notify();
        return serverActionQueue.addItem(action);
    }
    function dispatchServerAction() {
        const item = serverActionQueue.getItem();
        notify();
        if (!item)
            return;
        const { id, action } = item;
        restClient.post('/jason/api/action', action)
            .then(({ data }) => serverActionQueue.itemProcessed(id, data))
            .catch(error => {
            console.error("Server action failed", error);
            dispatch({ type: 'jason/upsert', payload: { error } });
            serverActionQueue.itemFailed(id, error);
        }).then(notify);
    }
    setInterval(dispatchServerAction, 10);
    return function (action) {
        const { type, payload } = action;
        const data = enrich(type, payload);
        dispatch({ type, payload: data });
        if (plurals.indexOf(type.split('/')[0]) > -1) {
            return enqueueServerAction({ type, payload: data });
        }
    };
}
exports.default = createOptDis;
