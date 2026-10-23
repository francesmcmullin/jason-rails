export default function useJason({ reducers, middleware, enhancers, transportOptions, dispatchDelay, extraActions }: {
    reducers?: any;
    middleware?: any[];
    enhancers?: any[];
    extraActions?: any;
    transportOptions?: any;
    dispatchDelay?: number;
}): any[];
