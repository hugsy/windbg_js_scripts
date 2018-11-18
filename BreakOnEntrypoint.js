/**
 * 
 * Simple JS script to break on entrypoint ($exentry)
 * 
 */

"use strict";


const log = x => host.diagnostics.debugLog(x + "\n");
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);


/**
 * 
 */
function invokeScript()
{
    var EntryPoint = host.namespace.Debugger.State.PseudoRegisters.General.exentry.address;
    system('bu ' + EntryPoint.toString(16));
}
