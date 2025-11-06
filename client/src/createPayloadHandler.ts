import { apply_patch } from 'jsonpatch'
import deepCamelizeKeys from './deepCamelizeKeys'
import pluralize from 'pluralize'
import _ from 'lodash'
import { validate as isUuid, v4 as uuidv4 } from 'uuid'

function diffSeconds(dt2, dt1) {
  var diff =(dt2.getTime() - dt1.getTime()) / 1000
  return Math.abs(Math.round(diff))
}

export default function createPayloadHandler({ dispatch, serverActionQueue, transportAdapter, config }) {
  const subscriptionId = uuidv4()

  let idx = {}
  let patchQueue = {}

  let lastCheckAt = new Date()
  let updateDeadline = null as Date | null
  let checkInterval
  let midSyncTimeout

  function getPayload() {
    setTimeout(() => transportAdapter.getPayload(config), 1000)
  }

  function camelizeKeys(item) {
    return deepCamelizeKeys(item, key => isUuid(key))
  }

  const tGetPayload = _.throttle(getPayload, 10000)

  function processQueue(model) {
    if(midSyncTimeout) { clearTimeout(midSyncTimeout) }
    console.debug("processQueue", model, idx[model], patchQueue[model])
    lastCheckAt = new Date()
    if (patchQueue[model][idx[model]]) {
      if (!serverActionQueue.fullySynced()) {
        console.debug(serverActionQueue.getData())
        midSyncTimeout = setTimeout(() => processQueue(model), 100)
        return
      }

      const { payload, destroy, id, type } = patchQueue[model][idx[model]]

      if (type === 'payload') {
        dispatch({ type: `${pluralize(model)}/upsertMany`, payload: payload.map(m => ({ ...m, id: String(m.id) })) })
        const ids = payload.map(instance => instance.id)
        dispatch({ type: `jasonModels/setSubscriptionIds`, payload: { model, subscriptionId, ids }})
      } else if (destroy) {
        // Middleware will determine if this model should be removed if it isn't in any other subscriptions
        dispatch({ type: `jasonModels/removeSubscriptionId`, payload: { model, subscriptionId, id }})
      } else {
        dispatch({ type: `${pluralize(model)}/upsert`, payload: { ...payload, id: String(payload.id) } })
        dispatch({ type: `jasonModels/addSubscriptionId`, payload: { model, subscriptionId, id }})
      }

      delete patchQueue[model][idx[model]]
      idx[model]++
      updateDeadline = null
      processQueue(model)
    // If there are updates in the queue that are ahead of the index, some have arrived out of order
    // Set a deadline for new updates before it declares the update missing and refetches.
    } else if (_.keys(patchQueue[model]).length > 0 && !updateDeadline) {
      var t = new Date()
      t.setSeconds(t.getSeconds() + 3)
      updateDeadline = t
      setTimeout(() => processQueue(model), 3100)
    // If more than 10 updates in queue, or deadline has passed, restart
    } else if (_.keys(patchQueue[model]).length > 10 || (updateDeadline && diffSeconds(updateDeadline, new Date()) < 0)) {
      tGetPayload()
      updateDeadline = null
    }
  }

  function handlePayload(data) {
    const { idx: newIdx, model: snake_model, type } = data
    const model = _.camelCase(snake_model)

    idx[model] = idx[model] || 0
    patchQueue[model] = patchQueue[model] || {}

    if (type === 'payload') {
      idx[model] = newIdx
      // Clear any old changes left in the queue
      patchQueue[model] = _.pick(patchQueue[model], _.keys(patchQueue[model]).filter(k => k > newIdx))
    }

    patchQueue[model][newIdx] = camelizeKeys({ ...data, model })
    console.debug("Added to queue", model, idx[model], camelizeKeys({ ...data, model }), serverActionQueue.getData())
    processQueue(model)

    if (diffSeconds((new Date()), lastCheckAt) >= 3) {
      lastCheckAt = new Date()
      console.debug('Interval lost. Pulling from server')
      tGetPayload()
    }
  }

  tGetPayload()

  // Clean up after ourselves
  function tearDown() {
    dispatch({ type: `jasonModels/removeSubscription`, payload: { subscriptionId }})
  }

  return { handlePayload, tearDown }
}
