import _ from 'lodash'
import pluralize from 'pluralize'
import { v4 as uuidv4 } from 'uuid'

function enrich(type, payload) {
  if (type.split('/')[1] === 'upsert' && !(type.split('/')[0] === 'session')) {
    if (!payload.id) {
      return { ...payload, id: uuidv4() }
    }
  }
  return payload
}

export default function createOptDis(schema, dispatch, restClient, serverActionQueue) {
  const plurals = _.keys(schema).map(k => pluralize(k))

  function notify() {
    const { queue, inFlight } = serverActionQueue.getData()
    dispatch({ type: 'jason/upsert', payload: { queueSize: queue.length, inFlight } })
  }

  function enqueueServerAction (action) {
    notify()
    return serverActionQueue.addItem(action)
  }

  function dispatchServerAction() {
    const item = serverActionQueue.getItem()
    notify()
    if (!item) return

    const { id, action } = item

    restClient.post('/jason/api/action', action)
    .then(({ data }) => serverActionQueue.itemProcessed(id, data))
    .catch(error => {
      console.error("Server action failed", error);
      dispatch({ type: 'jason/upsert', payload: { error } })
      serverActionQueue.itemFailed(id, error)
    }).then(notify)
  }

  setInterval(dispatchServerAction, 10)

  return function (action) {
    const { type, payload } = action
    const data = enrich(type, payload)

    dispatch({ type, payload: data })

    if (plurals.indexOf(type.split('/')[0]) > -1) {
      return enqueueServerAction({ type, payload: data })
    }
  }
}