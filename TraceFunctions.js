/**
 *
 * Define and assign a custom JS callback for a WinDbg breakpoint
 *
 * Use with
 * 0:000> .scriptload \path\to\TraceFunctions.js
 * 0:000> !trace "ntdll!memset"
 */

"use strict";

const log = x => host.diagnostics.debugLog(x + "\n");
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);

function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget != 0; }
function $(r){ if(!IsKd()) return host.currentThread.Registers.User[r]; else return host.namespace.Debugger.State.DebuggerVariables.curprocess.Threads.First().Registers.User[r]; }


/**
 * Print the rcx, rdx, r8, r9 registers when called.
 * This function will obviously only work for x64. It can adjusted to x86 by taking
 * the arguments from host.currentThread.Registers.User.rsp.
 *
 * @param {*} sym
 */
function PrintRegistersCallback(sym)
{
    let regs = ["rcx", "rdx", "r8", "r9"];
    let i = 0;
    let output = sym;
    output += "(";
    for( let i of [...Array(4).keys()] )
    {
        output += "arg[" + i.toString() + "]=" + $(regs[i]).toString(16) + " ";
    }
    output += ")";
    log(output);
    return false; // change to `true' to block on return
}


/**
 * Simple wrapper for host.getModuleSymbolAddress() to have a more
 * WinDbg-like syntax (i.e mod!func)
 *
 * @param {*} sym
 */
function GetSymbol(sym)
{
    if (sym.indexOf("!") == -1)
    {
        let default_modules = ["nt", "ntdll", "kernel32", "kernelbase"];
        for (let mod of default_modules)
        {
            var res = host.getModuleSymbolAddress(mod, sym);
            if (res != undefined)
            {
                return res;
            }
        }
    }

    var parts = sym.split("!");
    return host.getModuleSymbolAddress(parts[0], parts[1]);
}


/**
 * Set a custom breakpoint in WinDbg, allowing any JS function as callback
 *
 * @param {*} address
 * @param {*} callback
 */
function SetBreakpoint(location, callback)
{
    let target = GetSymbol(location);
    let address = target.toString(16);
    // BP trick by @0vercl0k
    let cmd = 'bp /w "@$scriptContents.PrintRegistersCallback(\\"'+ location +'\\")" 0x' + address;
    host.namespace.Debugger.Utility.Control.ExecuteCommand(cmd);
    log('Breakpoint set for "' + location + '" at ' + target.toString(16));
}


/**
 * main()
 *
 * Sets up a default tracer for VirtualAlloc.
 */
function invokeScript()
{
    SetBreakpoint('kernelbase!VirtualAlloc');
}


/**
 * __init__()
 *
 * Defines new function alias.
 *
 */
function initializeScript()
{
    return [
        new host.functionAlias(SetBreakpoint, "trace"),
    ];
}
