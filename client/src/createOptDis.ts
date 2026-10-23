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

export default function createOptDis(schema, dispatch, restClient, serverActionQueue, dispatchDelay) {
  const plurals = _.keys(schema).map(k => pluralize(k))
  let timeout = 0;

  function notify() {
    const { queue, inFlight } = serverActionQueue.getData()
    dispatch({ type: 'jason/upsert', payload: { queueSize: queue.length, inFlight } })
  }

  function enqueueServerAction (action) {
    notify()
    return serverActionQueue.addItem(action)
  }

  function dispatchServerAction() {
    try {
      const item = serverActionQueue.getItem()
      notify()
      if (!item) return queueDispatchServerAction();

      const { id, action } = item

      restClient.post('/jason/api/action', action)
      .then(({ data }) => serverActionQueue.itemProcessed(id, data))
      .catch(error => {
        console.error("Server action failed", error);
        dispatch({ type: 'jason/upsert', payload: { error } })
        serverActionQueue.itemFailed(id, error)
      }).then(notify)
      .then(queueDispatchServerAction, queueDispatchServerAction)
    } catch (e) {
      queueDispatchServerAction()
    }
  }

  function queueDispatchServerAction() {
    clearTimeout(timeout) // never queue more than one at a time.
    timeout = window.setTimeout(dispatchServerAction, dispatchDelay)
  }

  queueDispatchServerAction()

  return function (action) {
    const { type, payload } = action
    const data = enrich(type, payload)

    dispatch({ type, payload: data })

    if (plurals.indexOf(type.split('/')[0]) > -1) {
      return enqueueServerAction({ type, payload: data })
    }
  }
}