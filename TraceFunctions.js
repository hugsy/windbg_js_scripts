/**
 *
 * Define and assign a custom JS callback for a WinDbg breakpoint
 *
 * Use with
 * 0:000> .scriptload \path\to\TraceFunctions.js
 * 0:000> !trace "ntdll!memset"
 * Or
 * 0:000> !trace "ntdll!memset", 3
 * Or
 * 0:000> !trace "8509f008", 2
 * Or
 * 0:000> !trace "ntdll+0x245f"
 */

"use strict";

const log = x => host.diagnostics.debugLog(x + "\n");
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const u32 = x => host.memory.readMemoryValues(x, 1, 4)[0];
const u64 = x => host.memory.readMemoryValues(x, 1, 8)[0];

function IsX64() {return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize === 8;}
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget != 0; }
function $(r){ if(!IsKd()) return host.currentThread.Registers.User[r]; else return host.namespace.Debugger.State.DebuggerVariables.curprocess.Threads.First().Registers.User[r]; }




/**
 * Print the arguments when called (x64 version)
 *
 * @param {*} loc
 * @param {*} n
 * @param {*} comment
 */
function PrintRegistersCallback64(loc, n, comment="")
{
    let ptrsize = host.namespace.Debugger.State.PseudoRegisters.General.ptrsize;
    let regs = ["rcx", "rdx", "r8", "r9"];
    let output = new Array();

    for( let i of [...Array( Math.min(n, 4) ).keys()] )
    {
        output.push(`arg[${i.toString()}]=${$(regs[i]).toString(16)}`);
    }

    if(n > 4)
    {
        for( let i of [...Array(n - 4).keys()] )
        {
            let index = i + 4;
            let arg = u64($("rsp") + ptrsize*(index + 1));
            output.push(`arg[${i.toString()}]=${arg.toString(16)}`);
        }
    }

    log(`${comment}${loc}(${output.join(", ")})`);
    return false; // change to `true' to block on return
}


/**
 * Print the arguments when called (x86 version)
 *
 * @param {*} loc
 * @param {*} n
 * @param {*} comment
 */
function PrintRegistersCallback32(loc, n, comment="")
{
    let ptrsize = host.namespace.Debugger.State.PseudoRegisters.General.ptrsize;
    let output = new Array();

    for( let i of [...Array(n).keys()] )
    {
        let arg = u32($("esp") + ptrsize*(i + 1));
        output.push(`arg[${i.toString()}]=${arg.toString(16)}`);
    }

    log(`${comment}${loc}(${output.join(", ")})`);
    return false;
}


/**
 * Simple wrapper for host.getModuleSymbolAddress() to have a more
 * WinDbg-like syntax (i.e mod!func)
 *
 * @param {*} sym
 */
function GetAddressFromSymbol(sym)
{
    //if (sym.indexOf("!") === -1)
    //{
    //    let default_modules = ["nt", "ntdll", "kernel32", "kernelbase"];
    //    for (let mod of default_modules)
    //    {
    //        var res = host.getModuleSymbolAddress(mod, sym);
    //        if (res !== undefined)
    //        {
    //            return res;
    //        }
    //    }
    //}
    // let parts = sym.split("!");
    // return host.getModuleSymbolAddress(parts[0], parts[1]);  // doesn't work all the time, check why (TODO)

    let res = undefined;
    for (let line of system(`x ${sym}`))
    {
        if(line.includes(sym))
        {
            res = host.parseInt64(line.split(" ")[0], 16);
            break;
        }
    }
    return res;
}


/**
 * Set a custom breakpoint in WinDbg with a JS callback that will dump the `nb`
 * number of arguments.
 *
 * The credit for this breakpoint trick goes to by @0vercl0k
 *
 * @param {*} address
 * @param {*} nb_arg
 * @param {*} comment
 */
function PrintCallArguments(location, nb, comment)
{
    if (!IsKd())
        return;

    if (nb !== undefined)
        nb = parseInt(nb);
    else
        nb = -1;

    if (comment === undefined)
        comment = "";

    let address = GetAddressFromSymbol(location);
    if (address === undefined)
        address = location;
    else
        address = `0x${address.toString(16)}`;

    let cmd = IsX64()
    ? `bp /w "@$scriptContents.PrintRegistersCallback64(\\"${location}\\", ${nb}, \\"${comment}\\")" ${address}`
    : `bp /w "@$scriptContents.PrintRegistersCallback32(\\"${location}\\", ${nb}, \\"${comment}\\")" ${address}`;

    system(cmd);

    let msg = `Breakpoint set for "${location}" at ${address}`;
    if (nb >= 0)
        msg += ` with ${nb} argument(s)`;
    log(msg)
}


/**
 * main()
 *
 * Example: Sets up a default tracer for
 * VirtualAlloc(LPVOID lpAddress,SIZE_T dwSize,DWORD flAllocationType,DWORD flProtect);
 *
 */
function invokeScript()
{
    PrintCallArguments('kernelbase!VirtualAlloc', 4);
}


/**
 * __init__()
 *
 * Defines new function alias.
 *
 */
function initializeScript()
{
    log("[+] Installing new command `!trace`...");
    return [
        new host.functionAlias(PrintCallArguments, "trace"),
    ];
}
