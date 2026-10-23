import React from 'react'
import useJason from './useJason'
import { Provider } from 'react-redux'
import JasonContext from './JasonContext'

const JasonProvider = ({ reducers, middleware, enhancers, extraActions, transportOptions = {}, dispatchDelay = 10, children }: { reducers?: any, middleware?: any, enhancers?: any, extraActions?: any, transportOptions?: any, dispatchDelay?: number, children?: React.FC }) => {
  const [store, value] = useJason({ reducers, middleware, enhancers, extraActions, transportOptions, dispatchDelay })

  if(!(store && value)) return <div /> // Wait for async fetch of schema to complete

  return <Provider store={store}>
    <JasonContext.Provider value={value}>{ children }</JasonContext.Provider>
  </Provider>
}

export default JasonProvider


