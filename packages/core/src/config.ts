import * as process from "process";

var global = Function("return this")();
const fromJSConfig = global["__fromJSConfig"];
const isInInspectedEnvironment = !!global["__fromJSConfig"];

function getEnvValue(valueName) {
  if (isInInspectedEnvironment) {
    return fromJSConfig[valueName];
  } else {
    return process.env[valueName];
  }
}

// Whether to collect tracking data - disable for debugging to get big speedup but break traversal etc
export const SKIP_TRACKING = false;
// Whether to confirm that values are valid, point out missing tracking data etc
export const VERIFY = getEnvValue("VERIFY");
// Allows use of __debugLookupLog and __debugAllLogs to see the value of logs at runtime (rather than just their IDs)
// Only use for debugging, this can use a lot of memory
export const KEEP_LOGS_IN_MEMORY = false;

export const EXPLICIT_NAMES = false;

export const MINIMIZE_LOG_DATA_SIZE = true;

export const LOG_PERF = false;
