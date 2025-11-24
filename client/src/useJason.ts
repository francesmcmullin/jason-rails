import createActions from './createActions'
import createJasonReducers from './createJasonReducers'
import createPayloadHandler from './createPayloadHandler'
import createOptDis from './createOptDis'
import createServerActionQueue from './createServerActionQueue'
import restClient from './restClient'
import pruneIdsMiddleware from './pruneIdsMiddleware'
import createTransportAdapater from './createTransportAdapter'

import { createEntityAdapter, createSlice, createReducer, configureStore } from '@reduxjs/toolkit'

import { camelizeKeys } from 'humps'
import md5 from 'blueimp-md5'
import _ from 'lodash'
import React, { useState, useEffect } from 'react'

export default function useJason({ reducers, middleware = [], enhancers = [], transportOptions = {}, extraActions }: { reducers?: any, middleware?: any[], enhancers?: any[], extraActions?: any, transportOptions?: any }) {
  const [store, setStore] = useState(null as any)
  const [value, setValue] = useState(null as any)

  useEffect(() => {
    restClient.get('/jason/api/config')
    .then(({ data: jasonConfig }) => {
      const { schema: snakey_schema } = jasonConfig
      const schema = camelizeKeys(snakey_schema)
      console.debug({ schema })

      const serverActionQueue = createServerActionQueue()


      const allReducers = {
        ...reducers,
        ...createJasonReducers(schema)
      }

      console.debug({ allReducers })

      const store = configureStore({ reducer: allReducers, middleware: [...middleware, pruneIdsMiddleware(schema)], enhancers })
      const dispatch = store.dispatch

      const optDis = createOptDis(schema, dispatch, restClient, serverActionQueue)
      const actions = createActions(schema, store, restClient, optDis, extraActions)

      let payloadHandlers = {}
      let configs = {}
      let subOptions = {}

      function handlePayload(payload, retry) {
        const { md5Hash } = payload

        const payloadHandler = (payloadHandlers[md5Hash] || {}).handlePayload
        if (payloadHandler) {
          payloadHandler(payload)
        } else {
          if(retry) {
            console.warn("Payload arrived with no handler, discarding payload " + payload.model + payload.payload?.id, payload, payloadHandlers)
          } else {
            console.warn("Payload arrived with no handler, retrying on next tick " + payload.model + payload.payload?.id, payloadHandlers)
            setTimeout(() => handlePayload(payload, true), 0)
          }
        }
      }

      const transportAdapter = createTransportAdapater(
        jasonConfig,
        handlePayload,
        dispatch,
        () => _.keys(configs).forEach(md5Hash => createSubscription(configs[md5Hash], subOptions[md5Hash])),
        transportOptions
      )

      function createSubscription(config, options = {}) {
        // We need the hash to be consistent in Ruby / Javascript
        const hashableConfig = _({ conditions: {}, includes: {}, ...config }).toPairs().sortBy(0).fromPairs().value()
        const md5Hash = md5(JSON.stringify(hashableConfig))
        payloadHandlers[md5Hash] = createPayloadHandler({ dispatch, serverActionQueue, transportAdapter, config })
        configs[md5Hash] = hashableConfig
        subOptions[md5Hash] = options

        setTimeout(() => transportAdapter.createSubscription(hashableConfig), 500)
        let pollInterval = null as any;

        // This is only for debugging / dev - not prod!
        // @ts-ignore
        if (options.pollInterval) {
          // @ts-ignore
          pollInterval = setInterval(() => transportAdapter.getPayload(hashableConfig, { forceRefresh: true }), options.pollInterval)
        }

        return {
          remove() {
            removeSubscription(hashableConfig)
            if (pollInterval) clearInterval(pollInterval)
          },
          md5Hash
        }
      }

      function removeSubscription(config) {
        transportAdapter.removeSubscription(config)
        const md5Hash = md5(JSON.stringify(config))
        payloadHandlers[md5Hash]?.tearDown() // Race condition where component mounts then unmounts quickly
        delete payloadHandlers[md5Hash]
        delete configs[md5Hash]
        delete subOptions[md5Hash]
      }

      setValue({
        actions: actions,
        subscribe: createSubscription,
        handlePayload
      })
      setStore(store)
    })
  }, [])

  return [store, value]
}