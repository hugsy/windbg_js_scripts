/**
 *
 * Enumerate modules from nt!PsLoadedModuleList
 *
 * Use as:
 * kd> .scriptload \path\to\EnumModules.js
 * kd> dx -g @$LoadedModules()
 *
 * Calling with `.scriptrun` will also dump the list
 */

"use strict";

const log = x => host.diagnostics.debugLog(x + "\n");

function IsKd(){ return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }


/**
 * Create an iterator over the loaded modules (from nt!PsLoadedModuleList)
 */
function *LoadedModuleList()
{

    if ( !IsKd() )
    {
        log("Not KD");
        return;
    }

    // Get the value associated to the symbol nt!PsLoadedModuleList
    // And cast it as nt!LIST_ENTRY
    let pPsLoadedModuleHead = host.createPointerObject(host.getModuleSymbolAddress("nt", "PsLoadedModuleList"), "nt", "_LIST_ENTRY *");

    // Dereference the pointer (which makes us point to ntoskrnl)
    // Cast it to nt!KLDR_DATA_TABLE_ENTRY
    let pNtLdrDataEntry = host.createPointerObject(pPsLoadedModuleHead.address, "nt", "_LDR_DATA_TABLE_ENTRY *");

    // Create the iterator
    let PsLoadedModuleList = host.namespace.Debugger.Utility.Collections.FromListEntry(
        pNtLdrDataEntry.InLoadOrderLinks,
        "nt!_LDR_DATA_TABLE_ENTRY",
        "InLoadOrderLinks"
    );

    for (let item of PsLoadedModuleList)
    {
        yield item;
    }
}


/**
 *
 */
function invokeScript()
{
    for ( var mod of LoadedModuleList() )
    {
        log(" - " + mod.FullDllName);
    }
}


/**
 *
 */
function initializeScript()
{
    log("[+] Creating the variable `LoadedModules`...");
    return [new host.functionAlias(LoadedModuleList, "LoadedModules")];
}

