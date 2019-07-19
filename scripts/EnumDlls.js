/**
 *
 * Enumerate UM modules for the currently debugged process.
 *
 * This script was made as an exercice to manipulate the JS API, you should
 * really prefer using @$curprocess.Modules
 *
 * Use as:
 * 0:000> .scriptload \path\to\EnumDlls.js
 * 0:000> dx -g -r1 @$LoadedPeImages().Select( d => new { Name = (wchar_t*)(d.FullDllName.Buffer) } )
 *
 */

"use strict";


const log = x => host.diagnostics.debugLog(x + "\n");

function IsKd(){ return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }
function IsX64(){return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize === 8;}


const IMAGE_DLLCHARACTERISTICS_DYNAMIC_BASE = 0x0040;
const IMAGE_DLLCHARACTERISTICS_FORCE_INTEGRITY = 0x0080;
const IMAGE_DLLCHARACTERISTICS_NX_COMPAT = 0x0100;
const IMAGE_DLLCHARACTERISTICS_NO_ISOLATION = 0x0200;
const IMAGE_DLLCHARACTERISTICS_NO_SEH = 0x0400;
const IMAGE_DLLCHARACTERISTICS_NO_BIND = 0x0800;

const g_FlagsToCheck = {
    "DYNAMIC_BASE": 0x0040,
    "FORCE_INTEGRITY": 0x0080,
    "NX_COMPAT": 0x0100,
    "NO_ISOLATION": 0x0200,
    "NO_SEH": 0x0400,
    "NO_BIND": 0x0800
};


/**
 *
 */
function *LoadedPeImages()
{
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
function CheckSec(ImagePath, Dll)
{
    var DosHeader = host.createTypedObject(Dll.DllBase.address, "ntdll", "_IMAGE_DOS_HEADER");
    var PeHeader = IsX64()
        ? host.createTypedObject(Dll.DllBase.address.add(DosHeader.e_lfanew), "ntdll", "_IMAGE_NT_HEADERS64")
        : host.createTypedObject(Dll.DllBase.address.add(DosHeader.e_lfanew), "ntdll", "_IMAGE_NT_HEADERS32");
    var PeFlags = PeHeader.OptionalHeader.DllCharacteristics;
    var flags = [];

    for( let flagName in g_FlagsToCheck )
    {
        let flagValue = g_FlagsToCheck[flagName];
        if (PeFlags & flagValue)
        {
            flags.push(flagName);
        }
    }

    return `- Image : "${ImagePath} (base 0x${DosHeader.address.toString(16)})"\n\tFlags : ${flags.join("|")}`;
}



/**
 *
 */
function checksec()
{
    if (IsKd())
    {
        log("Cannot run in KD");
        return;
    }

    for( let Dll of LoadedPeImages() )
    {
        var Name = host.memory.readWideString(Dll.FullDllName.Buffer.address);
        log(CheckSec(Name, Dll));
    }
}


/**
 *
 */
class EnumDlls
{
    get Dlls()
    {
        return LoadedPeImages();
    }
}


/**
 *
 */
function invokeScript()
{
    return checksec();
}


/**
 *
 */
function initializeScript()
{
    //log("[+] Adding the command `LoadedPeImages`...");
    return [
        new host.apiVersionSupport(1, 3),

        new host.functionAlias(
            LoadedPeImages,
            "LoadedDlls"
        ),

        new host.functionAlias(
            checksec,
            "checksec"
        ),

        new host.namedModelParent(
            EnumDlls,
            'Debugger.Models.Process'
        ),
    ];
}

