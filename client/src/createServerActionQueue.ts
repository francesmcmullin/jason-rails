// A FIFO queue with deduping of actions whose effect will be cancelled by later actions
import { v4 as uuidv4 } from 'uuid'
import _ from 'lodash'

class Deferred {
  promise: Promise<any>;
  resolve: any;
  reject: any;

  constructor() {
    this.promise = new Promise((resolve, reject)=> {
      this.reject = reject
      this.resolve = resolve
    })
  }
}

export default function createServerActionQueue() {
  const queue: any[] = []
  const deferreds = {}

  let inFlight = false

  function addItem(action) {
    // Check if there are any items ahead in the queue that this item would effectively overwrite.
    // In that case we can remove them
    // If this is an upsert && item ID is the same && current item attributes are a superset of the earlier item attributes
    const { type, payload } = action
    const id = uuidv4()
    const dfd = new Deferred()
    deferreds[id] = [dfd]

    const item = { id, action }

    if (type.split('/')[1] === 'upsert') {
      _.remove(queue, item => {
        const { type: itemType, payload: itemPayload } = item.action
        if (type !== itemType) return false
        if (itemPayload.id !== payload.id) return false

        // Check that all keys of itemPayload are in payload.
        if(_.difference(_.keys(itemPayload),_.keys(payload)).length === 0) {
          console.warn("Removing server action from queue", item.id, item)
          deferreds[id].push(...deferreds[item.id])
          return true
        }
      })
    }

    queue.push(item)
    return dfd.promise
  }

  function itemProcessed(id, data?: any) {
    inFlight = false
    deferreds[id].forEach(dfd => dfd.resolve(data))
  }

  function itemFailed(id, error?: any) {
    queue.length = 0
    deferreds[id].forEach(dfd => dfd.reject(error))
    inFlight = false
  }

  return {
    addItem,
    getItem: () => {
      if (inFlight) return false

      const item = queue.shift()
      if (item) {
        inFlight = true
        return item
      }
      return false
    },
    itemProcessed,
    itemFailed,
    fullySynced: () => queue.length === 0 && !inFlight,
    getData: () => ({ queue, inFlight })
  }
}