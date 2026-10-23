"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const useJason_1 = __importDefault(require("./useJason"));
const react_redux_1 = require("react-redux");
const JasonContext_1 = __importDefault(require("./JasonContext"));
const JasonProvider = ({ reducers, middleware, enhancers, extraActions, transportOptions = {}, dispatchDelay = 10, children }) => {
    const [store, value] = useJason_1.default({ reducers, middleware, enhancers, extraActions, transportOptions, dispatchDelay });
    if (!(store && value))
        return react_1.default.createElement("div", null); // Wait for async fetch of schema to complete
    return react_1.default.createElement(react_redux_1.Provider, { store: store },
        react_1.default.createElement(JasonContext_1.default.Provider, { value: value }, children));
};
exports.default = JasonProvider;
