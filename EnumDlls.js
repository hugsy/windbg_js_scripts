/**
 *
 * Enumerate UM modules for the currently debugged process.
 *
 * This script was made as an exercice to manipulate the JS API, you should
 * really prefer using @$curprocess.Modules
 *
 * Use as:
 * 0:000> .scriptload \path\to\EnumDlls.js
 * 0:000> dx -g -r1 @$LoadedDlls().Select( d => new { Name = (wchar_t*)(d.FullDllName.Buffer) } )
 *
 */

"use strict";


const log = x => host.diagnostics.debugLog(x + "\n");

function IsKd(){ return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget != 0; }


/**
 *
 */
function *LoadedDlls()
{
    if (IsKd())
    {
        log("Cannot run in KD");
        yield;
    }

    // Get the PEB and Loader info from the the pseudo-registers
    let peb = host.namespace.Debugger.State.PseudoRegisters.General.peb;

    // Create the iterator
    let ModuleList = host.namespace.Debugger.Utility.Collections.FromListEntry(
        peb.Ldr.InLoadOrderModuleList,
        "ntdll!_LDR_DATA_TABLE_ENTRY",
        "InLoadOrderLinks"
    );

    for( let m of ModuleList )
    {
        yield m;
    }

}


/**
 *
 */
function initializeScript()
{
    log("[+] Creating the variable `LoadedDlls`...");
    return [ new host.functionAlias(LoadedDlls, "LoadedDlls") ];
}

