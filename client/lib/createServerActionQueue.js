"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// A FIFO queue with deduping of actions whose effect will be cancelled by later actions
const uuid_1 = require("uuid");
const lodash_1 = __importDefault(require("lodash"));
class Deferred {
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.reject = reject;
            this.resolve = resolve;
        });
    }
}
function createServerActionQueue() {
    const queue = [];
    const deferreds = {};
    let inFlight = false;
    function addItem(action) {
        // Check if there are any items ahead in the queue that this item would effectively overwrite.
        // In that case we can remove them
        // If this is an upsert && item ID is the same && current item attributes are a superset of the earlier item attributes
        const { type, payload } = action;
        const id = uuid_1.v4();
        const dfd = new Deferred();
        deferreds[id] = [dfd];
        const item = { id, action };
        if (type.split('/')[1] === 'upsert') {
            lodash_1.default.remove(queue, item => {
                const { type: itemType, payload: itemPayload } = item.action;
                if (type !== itemType)
                    return false;
                if (itemPayload.id !== payload.id)
                    return false;
                // Check that all keys of itemPayload are in payload.
                if (lodash_1.default.difference(lodash_1.default.keys(itemPayload), lodash_1.default.keys(payload)).length === 0) {
                    console.warn("Removing server action from queue", item.id, item);
                    deferreds[id].push(...deferreds[item.id]);
                    return true;
                }
            });
        }
        queue.push(item);
        return dfd.promise;
    }
    function itemProcessed(id, data) {
        inFlight = false;
        deferreds[id].forEach(dfd => dfd.resolve(data));
    }
    function itemFailed(id, error) {
        queue.length = 0;
        deferreds[id].forEach(dfd => dfd.reject(error));
        inFlight = false;
    }
    return {
        addItem,
        getItem: () => {
            if (inFlight)
                return false;
            const item = queue.shift();
            if (item) {
                inFlight = true;
                return item;
            }
            return false;
        },
        itemProcessed,
        itemFailed,
        fullySynced: () => queue.length === 0 && !inFlight,
        getData: () => ({ queue, inFlight })
    };
}
exports.default = createServerActionQueue;
