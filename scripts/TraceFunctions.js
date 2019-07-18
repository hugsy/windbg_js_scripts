/**
 *
 * Define and assign a custom JS callback for a WinDbg breakpoint
 *
 * Use with
 * 0:000> .scriptload \path\to\TraceFunctions.js
 * 0:000> !trace "ntdll!memset"
 * Or
 * 0:000> !trace "ntdll!memset", "3"
 * Or
 * 0:000> !trace "8509f008", "1:3"
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
 * @param {*} range
 * @param {*} comment
 */
function PrintRegistersCallback64(loc, n, comment="")
{
    let ptrsize = host.namespace.Debugger.State.PseudoRegisters.General.ptrsize;
    let regs = ["rcx", "rdx", "r8", "r9"];
    let output = new Array();
    let min_range = parseInt(range.split(":")[0]);
    let max_range = parseInt(range.split(":")[1]);

    for( let i of [...Array(max_range).slice(min_range, max_range).keys()] )
    {
        let index = min_range + i;
        if( index < 4)
        {
            output.push(`arg[${index.toString()}]=${$(regs[index]).toString(16)}`);
        }
        else
        {
            let arg = u64($("rsp") + ptrsize*index);
            output.push(`arg[${index.toString()}]=${arg.toString(16)}`);
        }
    }

    log(`${comment}${loc}(${output.join(", ")})`);
    return false; // change to `true' to block on return
}


/**
 * Print the arguments when called (x86 version)
 *
 * @param {*} loc
 * @param {*} range
 * @param {*} comment
 */
function PrintRegistersCallback32(loc, range, comment="")
{
    let ptrsize = host.namespace.Debugger.State.PseudoRegisters.General.ptrsize;
    let output = new Array();
    let parts = range.split(":");
    let min_range = parseInt(parts[0]);
    let max_range = parseInt(parts[1]);

    for( let i of [...Array(max_range).slice(min_range, max_range).keys()] )
    {
        let index = min_range + i;
        let arg = u32($("esp") + ptrsize*index);
        output.push(`arg[${index.toString()}]=${arg.toString(16)}`);
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
 * @param {*} range
 * @param {*} comment
 */
function PrintCallArguments(location, range, comment)
{
    if (!IsKd())
        return;

    if (range === undefined)
    {
        range = "0:4";
    }
    else
    {
        if (range.indexOf(":") === -1)
        {
            range = `0:${range}`;
        }
    }

    if (comment === undefined)
        comment = "";

    let address = GetAddressFromSymbol(location);
    if (address === undefined)
        address = location;
    else
        address = `0x${address.toString(16)}`;

    let cmd = IsX64()
    ? `bp /w "@$scriptContents.PrintRegistersCallback64(\\"${location}\\", \\"${range}\\", \\"${comment}\\")" ${address}`
    : `bp /w "@$scriptContents.PrintRegistersCallback32(\\"${location}\\", \\"${range}\\", \\"${comment}\\")" ${address}`;

    system(cmd);

    let msg = `Breakpoint set for "${location}" at ${address}`;
    log(msg);

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
