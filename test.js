"use strict";

var log = host.diagnostics.debugLog;

function invokeScript()
{
    var EntryPoint = host.namespace.Debugger.State.PseudoRegisters.General.exentry.address;
    log(EntryPoint.toString(16));

    //var a = host.parseInt64('0x1337', 16);
    //log(a.toString(16)+ "\n");

}

