import stringTraceUseValue from "./stringTraceUseValue"
import StringTraceString, {makeTraceObject} from "./FromJSString"
import Origin from "../origin"
import untrackedString from "./untrackedString"


var cachedValue;

var babelFunctions = {
    f__StringLiteral(value){
        return makeTraceObject({
            value: value,
            origin: new Origin({
                action: "String Literal",
                value: value,
                inputValues: []
            }),
        })
    },
    f__typeof(a){
        if (a && a.isStringTraceString) {
            // rather confusingly a FromJSString can have a non string value...
            return typeof a.value
        }
        return typeof a
    },
    f__useValue(thing){
        return stringTraceUseValue(thing)
    },
    f__add(a, b){
        var stack = new Error().stack.split("\n")
        if (a == null){
            a = ""
        }
        if (b==null){
            b = ""
        }
        if (!a.isStringTraceString && typeof a === "string"){
            a = untrackedString(a);
        }
        if (!b.isStringTraceString && typeof b === "string"){
            b = untrackedString(b);
        }
        if (!a.isStringTraceString) {
            return a + b;// not a string operation i think, could still be inferred to a stirng tho
        }

        var newValue = a.toString() + b.toString();
        return makeTraceObject({
            value: newValue,
            origin: new Origin({
                action: "Concat",
                value: newValue,
                inputValues: [a, b]
            })
        })
    },
    f__notTripleEqual(a,b){
        if (a && a.isStringTraceString) {
            a = a.toString()
        }
        if(b && b.isStringTraceString) {
            b = b.toString();
        }
        return a !== b;
    },
    f__tripleEqual(a,b){
        return !babelFunctions.f__notTripleEqual(a,b)
    },
    t__setInnerHTML(el, innerHTML){
        // no longer any processing here, hook purely based on property name
        // isn't very robust, just monkey patch Element.prototype.innerHTML
        el.innerHTML = innerHTML
    },
    f__not(val){
        return !stringTraceUseValue(val)
    },
    f__setCachedValue(val){
        cachedValue = val
        return val
    },
    f__getCachedValue(val){
        return cachedValue
    }
}

export default babelFunctions

export function addBabelFunctionsToGlobalObject(){
    Object.keys(babelFunctions).forEach(function(functionName){
        window[functionName] = babelFunctions[functionName]
    })
}
