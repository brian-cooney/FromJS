import OperationLog, { getOperationIndex } from "./OperationLog";
import getElementOperationLogMapping from "./getHtmlNodeOperationLogMapping";
import getHtmlNodeOperationLogMapping from "./getHtmlNodeOperationLogMapping";
import initDomInspectionUI from "./initDomInspectionUI";
import KnownValues from "./KnownValues";
import { ExecContext } from "./ExecContext";
import operations from "../operations";
import { SKIP_TRACKING, VERIFY, KEEP_LOGS_IN_MEMORY } from "../config";
import * as FunctionNames from "../FunctionNames";

declare var __FUNCTION_NAMES__,
  __OPERATION_TYPES__,
  __OPERATIONS_EXEC__,
  __storeLog;

(function(functionNames, operationTypes, operationsExec) {
  const accessToken = "ACCESS_TOKEN_PLACEHOLDER";

  Error["stackTraceLimit"] = 1000;

  var global = Function("return this")();
  if (global.__didInitializeDataFlowTracking) {
    return;
  }
  global.__didInitializeDataFlowTracking = true;

  global.getElementOperationLogMapping = getElementOperationLogMapping;

  let knownValues = new KnownValues();

  // Make sure to use native methods in case browser methods get
  // overwritten (e.g. NewRelic instrumentation does it)
  let fetch = knownValues.getValue("fetch");
  let then = knownValues.getValue("Promise.prototype.then");

  // window["__fromJSGetPerfStats"] = function getPerfStats() {
  //   sendLogsToServer(); // update perf data
  //   return perfStats;
  // };

  const startTime = new Date();
  setTimeout(checkDone, 200);
  function checkDone() {
    const done = document.querySelector(".todo-list li");
    if (done) {
      const doneTime = new Date();
      console.log("#####################################");
      console.log("#####################################");
      console.log("#####################################");
      console.log("#####################################");
      console.log("#####################################");
      console.log("#####################################");
      console.log(
        "DONE",
        "timeTaken: " + (doneTime.valueOf() - startTime.valueOf()) / 1000 + "s"
      );
      worker.postMessage({ showDoneMessage: true });
    } else {
      setTimeout(checkDone, 200);
    }
  }

  function postToBE(endpoint, data, statsCallback = function(size) {}) {
    const stringifyStart = new Date();
    const body = JSON.stringify(data);
    const stringifyEnd = new Date();
    if (endpoint === "/storeLogs") {
      console.log(
        "Saving logs: ",
        data.logs.length,
        "Size: ",
        body.length / 1024 / 1024,
        "Mb",
        "Stringify took " +
          (stringifyEnd.valueOf() - stringifyStart.valueOf()) +
          "ms"
      );

      statsCallback({
        bodyLength: body.length
      });
    }
    const p = fetch("http://localhost:BACKEND_PORT_PLACEHOLDER" + endpoint, {
      method: "POST",
      headers: new Headers({
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: accessToken
      }),
      body: body
    });

    return p;
  }

  let logQueue = [];
  window["__debugFromJSLogQueue"] = () => logQueue;
  let evalScriptQueue = [];
  let worker;
  function sendLogsToServer() {
    if (!worker) {
      function workerCode() {
        self["perfStats"] = {
          totalLogCount: 0,
          logDataBytesSent: 0
        };
        onmessage = function(e) {
          if (e.data.logs) {
            self["perfStats"].totalLogCount += e.data.logs.length;
            postToBE("/storeLogs", e.data, function({ bodyLength }) {
              self["perfStats"].logDataBytesSent += bodyLength;
            });
          } else if (e.data.showDoneMessage) {
            const perfInfo = self["perfStats"];
            console.log("DONE", {
              totalLogCount: perfInfo.totalLogCount / 1000 + "k",
              logDataSent: perfInfo.logDataBytesSent / 1024 / 1024 + "mb"
            });
          }
        };
      }
      worker = new Worker(
        URL.createObjectURL(
          new Blob([
            postToBE +
              ";var accessToken = '" +
              accessToken +
              "'" +
              ";(" +
              workerCode +
              ")()"
          ])
        )
      );
    }

    if (logQueue.length === 0 && evalScriptQueue.length == 0) {
      return;
    }

    const data = {
      logs: logQueue,
      evalScripts: evalScriptQueue
    };

    // Doing this means the data will be cloned, but it seems to be
    // reasonably fast anyway
    // Creating the json and making the request in the main thread is super slow!
    worker.postMessage(data);

    // postToBE("/storeLogs", data);

    logQueue = [];
    evalScriptQueue = [];
  }
  // If page laods quickly try to send data to BE soon, later on wait
  // 1s between requests
  setTimeout(sendLogsToServer, 200);
  setTimeout(sendLogsToServer, 400);
  setInterval(sendLogsToServer, 1000);
  function remotelyStoreLog(log) {
    logQueue.push(log);
  }

  const storeLog =
    typeof __storeLog !== "undefined" ? __storeLog : remotelyStoreLog;

  let lastOperationType = null;
  function createOperationLog(args) {
    if (SKIP_TRACKING) {
      return 1111;
    }
    var log = OperationLog.createAtRuntime(args, knownValues);
    storeLog(log);

    if (KEEP_LOGS_IN_MEMORY) {
      // Normally we just store the numbers, but it's useful for
      // debugging to be able to view the log object
      window["__debugAllLogs"] = window["__debugAllLogs"] || {};
      window["__debugAllLogs"][log.index] = log;
    }

    return log.index;
  }

  if (KEEP_LOGS_IN_MEMORY) {
    global["__debugLookupLog"] = function(logId, currentDepth = 0) {
      try {
        var log = JSON.parse(JSON.stringify(global["__debugAllLogs"][logId]));
        if (currentDepth < 12) {
          const newArgs = {};
          Object.keys(log.args).forEach(key => {
            newArgs[key] = global["__debugLookupLog"](
              log.args[key],
              currentDepth + 1
            );
          });
          log.args = newArgs;
        }
        if (currentDepth < 12 && log.extraArgs) {
          const newExtraArgs = {};
          Object.keys(log.extraArgs).forEach(key => {
            newExtraArgs[key] = global["__debugLookupLog"](
              log.extraArgs[key],
              currentDepth + 1
            );
          });
          log.extraArgs = newExtraArgs;
        }

        return log;
      } catch (err) {
        return logId;
      }
    };
  }

  var argTrackingInfo = null;

  global[
    functionNames.getFunctionArgTrackingInfo
  ] = function getArgTrackingInfo(index) {
    if (!argTrackingInfo) {
      // this can happen when function is invoked without callexpression op,
      // e.g. when it's a callback argument to a native api call
      // TODO: return some kind of tracking value here ("untracked argument")
      // ideally also include a loc
      if (VERIFY) {
        console.log("no arg tracking info...");
      }
      return undefined;
    }
    if (index === undefined) {
      return argTrackingInfo;
    }
    return argTrackingInfo[index];
  };

  global.getTrackingAndNormalValue = function(value) {
    return {
      normal: value,
      tracking: argTrackingInfo[0]
    };
  };

  // don't think this is needed, only used in demo with live code ediotr i think
  global.inspect = function(value) {
    global.inspectedValue = {
      normal: value,
      tracking: argTrackingInfo[0]
    };
  };

  initDomInspectionUI();

  global["__getHtmlNodeOperationLogMapping"] = getHtmlNodeOperationLogMapping;

  global.fromJSInspect = function(value: any, charIndex: number) {
    let logId;
    if (!argTrackingInfo && typeof value === "number") {
      if (charIndex) {
        throw Error("Not supported yet");
      }
      logId = value;
    } else if (value instanceof Node) {
      const mapping = getHtmlNodeOperationLogMapping(value);
      console.log({ mapping });
      postToBE("/inspectDOM", { ...mapping, charIndex });
    } else {
      if (charIndex) {
        throw Error("Not supported yet");
      }
      logId = argTrackingInfo[0];
    }
    postToBE("/inspect", {
      logId
    });
  };

  function getTrackingPropName(propName) {
    if (VERIFY) {
      try {
        if (parseFloat(propName) > 200) {
          console.log(
            "tracking array index greater than 200...1) perf issue, 2) possibly some kind of infinite loop"
          );
        }
      } catch (err) {}
    }
    // note: might be worth using Map instead and seeing how perf is affected
    if (typeof propName === "symbol") {
      return propName;
    } else {
      // "_" prefix because to avoid conflict with normal object methods,
      // e.g. there used to be problems when getting tracking value for "constructor" prop
      return "_" + propName;
    }
  }

  const objTrackingMap = new WeakMap();
  window["__debugObjTrackingMap"] = objTrackingMap;
  function trackObjectPropertyAssignment(
    obj,
    propName,
    propertyValueTrackingValue,
    propertyNameTrackingValue = null
  ) {
    if (!propertyNameTrackingValue && VERIFY) {
      // debugger;
      console.count("no propertyNameTrackingValue");
    }
    // console.log("trackObjectPropertyAssignment", obj, propName, trackingValue)
    var objectPropertyTrackingInfo = objTrackingMap.get(obj);
    if (!objectPropertyTrackingInfo) {
      objectPropertyTrackingInfo = {};
      objTrackingMap.set(obj, objectPropertyTrackingInfo);
    }
    if (
      typeof propertyValueTrackingValue !== "number" &&
      !!propertyValueTrackingValue
    ) {
      debugger;
    }
    objectPropertyTrackingInfo[getTrackingPropName(propName)] = {
      value: propertyValueTrackingValue,
      name: propertyNameTrackingValue
    };
  }

  function getObjectPropertyTrackingValues(obj, propName) {
    var objectPropertyTrackingInfo = objTrackingMap.get(obj);
    if (!objectPropertyTrackingInfo) {
      return undefined;
    }
    const trackingValues =
      objectPropertyTrackingInfo[getTrackingPropName(propName)];
    if (!trackingValues) {
      return undefined;
    }
    return trackingValues;
  }

  function getObjectPropertyValueTrackingValue(obj, propName) {
    const trackingValues = getObjectPropertyTrackingValues(obj, propName);
    if (trackingValues === undefined) {
      return undefined;
    }
    return trackingValues.value;
  }
  window[
    "getObjectPropertyTrackingValue"
  ] = getObjectPropertyValueTrackingValue;

  function getObjectPropertyNameTrackingValue(obj, propName) {
    const trackingValues = getObjectPropertyTrackingValues(obj, propName);
    if (trackingValues === undefined) {
      return undefined;
    }
    return trackingValues.name;
  }

  window[
    FunctionNames.getObjectPropertyNameTrackingValue
  ] = getObjectPropertyNameTrackingValue;

  var lastMemberExpressionObjectValue = null;
  var lastMemberExpressionObjectTrackingValue = null;
  global[functionNames.getLastMemberExpressionObject] = function() {
    return [
      lastMemberExpressionObjectValue,
      lastMemberExpressionObjectTrackingValue
    ];
  };

  var lastReturnStatementResult = null;

  const memoValues = {};
  global[functionNames.setMemoValue] = function(key, value, trackingValue) {
    // console.log("setmemovalue", value)
    memoValues[key] = { value, trackingValue };
    setLastOpTrackingResult(trackingValue);
    validateTrackingValue(trackingValue);
    return value;
  };
  global[functionNames.getMemoArray] = function(key) {
    const memo = memoValues[key];
    return [memo.value, memo.trackingValue];
  };
  global[functionNames.getMemoValue] = function(key) {
    return memoValues[key].value;
  };
  global[functionNames.getMemoTrackingValue] = function(key) {
    return memoValues[key].trackingValue;
  };

  function validateTrackingValue(trackingValue) {
    if (!!trackingValue && typeof trackingValue !== "number") {
      debugger;
      throw Error("eee");
    }
  }

  function setLastOpTrackingResult(trackingValue) {
    validateTrackingValue(trackingValue);
    lastOpTrackingResult = trackingValue;
  }

  const ctx: ExecContext = {
    operationTypes,
    getObjectPropertyTrackingValue: getObjectPropertyValueTrackingValue,
    getObjectPropertyNameTrackingValue,
    trackObjectPropertyAssignment,
    hasInstrumentationFunction: typeof global["__fromJSEval"] === "function",
    createOperationLog: function(args) {
      args.index = getOperationIndex();
      return createOperationLog(args);
    },
    knownValues,
    global,
    registerEvalScript(evalScript) {
      // store code etc for eval'd code
      evalScriptQueue.push(evalScript);
    },
    objectHasPropertyTrackingData(obj) {
      return !!objTrackingMap.get(obj);
    },
    get lastOpTrackingResult() {
      return lastOpTrackingResult;
    },
    get lastOpTrackingResultWithoutResetting() {
      return lastOpTrackingResultWithoutResetting;
    },
    get lastReturnStatementResult() {
      return lastReturnStatementResult;
    },
    set lastReturnStatementResult(val) {
      lastReturnStatementResult = val;
    },
    set lastMemberExpressionResult([normal, tracking]) {
      lastMemberExpressionObjectValue = normal;
      lastMemberExpressionObjectTrackingValue = tracking;
    },
    set argTrackingInfo(info) {
      if (info) {
        info.forEach(trackingValue => validateTrackingValue(trackingValue));
      }
      argTrackingInfo = info;
    },
    get lastOperationType() {
      return lastOperationType;
    }
  };

  var lastOpValueResult = null;
  var lastOpTrackingResult = null;
  let lastOpTrackingResultWithoutResetting = null;

  function makeDoOperation(opName: string) {
    const opExec = operationsExec[opName];

    return function ___op(objArgs, astArgs, loc) {
      var trackingValue;

      let logData: any = {
        operation: opName,
        args: objArgs,
        astArgs: astArgs,
        loc,
        index: getOperationIndex()
      };

      var ret = opExec(objArgs, astArgs, ctx, logData);

      logData.result = ret;
      trackingValue = createOperationLog(logData);

      lastOpValueResult = ret;

      lastOpTrackingResultWithoutResetting = trackingValue;
      setLastOpTrackingResult(trackingValue);

      lastOperationType = opName;

      if (logQueue.length > 100000) {
        // avoid running out of memory
        sendLogsToServer();
      }

      return ret;
    };
  }

  global[functionNames.doOperation] = function ___op(
    opName: string,
    objArgs,
    astArgs,
    loc
  ) {
    return global["__" + opName](objArgs, astArgs, loc);
  };

  operationsExec = {};
  Object.keys(operations).forEach(opName => {
    const op = operations[opName];
    operationsExec[opName] = op.exec;
    const doOpFunction = makeDoOperation(opName);

    // The object creation in so many places is expensive
    // so some simple ops have a shorthand function that
    // is called instead of __op and calls through to __op
    if (op.shorthand) {
      global[op.shorthand.fnName] = op.shorthand.getExec(doOpFunction);
    }

    global["__" + opName] = doOpFunction;
  });

  global[functionNames.getLastOperationValueResult] = function getLastOp() {
    var ret = lastOpValueResult;
    lastOpValueResult = null;
    return ret;
  };
  global[functionNames.getLastOperationTrackingResult] = function getLastOp() {
    validateTrackingValue(lastOpTrackingResult);
    var ret = lastOpTrackingResult;
    lastOpTrackingResult = null;
    return ret;
  };
  global[
    functionNames.getLastOperationTrackingResultWithoutResetting
  ] = function getLastOp() {
    validateTrackingValue(lastOpTrackingResult);
    return lastOpTrackingResult;
  };
})(__FUNCTION_NAMES__, __OPERATION_TYPES__, null);
