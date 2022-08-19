/// <reference path="JSProvider.d.ts" />
"use strict";


/**
 *
 * Enumerate DLLs for the currently debugged process.
 *
 * Works in KD too, use `dx @$cursession.Processes.Where().SwitchTo()` to modify the @$curprocess.
 * Also you might need to `.reload /f /user` (also `.pagein $addr` might be of use)
 *
 * Examples:
 * 0:000> .scriptload \path\to\EnumImages.js
 * 0:000> dx -g -r1 @$curprocess.Dlls.Where( x => x.Name == "ntdll.dll" )
 *
 * kd> .scriptload \path\to\EnumImages.js
 * kd> dx @$cursession.Modules.Where( x => x.Name.Contains("cdrom.sys") )
 *
 */


const log = x => host.diagnostics.debugLog(`${x}\n`);
const ok = x => log(`[+] ${x}`);
const warn = x => log(`[!] ${x}`);
const err = x => log(`[-] ${x}`);

function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }
function IsX64() { return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize === 8; }
function cursession() { return host.namespace.Debugger.State.DebuggerVariables.cursession; }
function curprocess() { return host.namespace.Debugger.State.DebuggerVariables.curprocess; }

const IMAGE_DLLCHARACTERISTICS_DYNAMIC_BASE = 0x0040;
const IMAGE_DLLCHARACTERISTICS_FORCE_INTEGRITY = 0x0080;
const IMAGE_DLLCHARACTERISTICS_NX_COMPAT = 0x0100;
const IMAGE_DLLCHARACTERISTICS_NO_ISOLATION = 0x0200;
const IMAGE_DLLCHARACTERISTICS_NO_SEH = 0x0400;
const IMAGE_DLLCHARACTERISTICS_NO_BIND = 0x0800;

const g_FlagsToCheck = {
    "DYNAMIC_BASE": IMAGE_DLLCHARACTERISTICS_DYNAMIC_BASE,
    "FORCE_INTEGRITY": IMAGE_DLLCHARACTERISTICS_FORCE_INTEGRITY,
    "NX_COMPAT": IMAGE_DLLCHARACTERISTICS_NX_COMPAT,
    "NO_ISOLATION": IMAGE_DLLCHARACTERISTICS_NO_ISOLATION,
    "NO_SEH": IMAGE_DLLCHARACTERISTICS_NO_SEH,
    "NO_BIND": IMAGE_DLLCHARACTERISTICS_NO_BIND,
};



/**
 *
 */
function* EnumerateCurrentProcessModules() {
    //
    // Get the PEB and Loader info from the the pseudo-registers
    //
    let peb = IsKd() ? curprocess().KernelObject.Peb : host.namespace.Debugger.State.PseudoRegisters.General.peb;

    //
    // Create the iterator
    //
    let ModuleList = host.namespace.Debugger.Utility.Collections.FromListEntry(
        peb.Ldr.InLoadOrderModuleList,
        "ntdll!_LDR_DATA_TABLE_ENTRY",
        "InLoadOrderLinks"
    );

    for (let m of ModuleList) {
        yield {
            Entry: m,
            get Name() { let res = m.BaseDllName.ToDisplayString(); return res.length > 0 ? res.slice(1, -1) : "" },
            get Path() { let res = m.FullDllName.ToDisplayString(); return res.length > 0 ? res.slice(1, -1) : "" },
            toString() {
                return `${this.Name} - ${m.DllBase.address}`;
            },
        }
    }
}

function* EnumerateSystemModules() {
    if (!IsKd()) {
        err("KD only");
        return;
    }

    //
    // Get the value associated to the symbol nt!PsLoadedModuleList and cast it as nt!LIST_ENTRY
    //
    let pPsLoadedModuleHead = host.createPointerObject(host.getModuleSymbolAddress("nt", "PsLoadedModuleList"), "nt", "_LIST_ENTRY *");

    // Dereference the pointer (which makes us point to ntoskrnl)
    // Cast it to nt!KLDR_DATA_TABLE_ENTRY
    let pNtLdrDataEntry = host.createPointerObject(pPsLoadedModuleHead.address, "nt", "_LDR_DATA_TABLE_ENTRY *");

    //
    // Create the iterator
    //
    let PsLoadedModuleList = host.namespace.Debugger.Utility.Collections.FromListEntry(
        pNtLdrDataEntry.InLoadOrderLinks,
        "nt!_LDR_DATA_TABLE_ENTRY",
        "InLoadOrderLinks"
    );

    for (let item of PsLoadedModuleList) {
        yield {
            Entry: item,
            get Name() { let res = item.BaseDllName.ToDisplayString(); return res.length > 0 ? res.slice(1, -1) : "" },
            get Path() { let res = item.FullDllName.ToDisplayString(); return res.length > 0 ? res.slice(1, -1) : "" },
            toString() {
                return `${this.Name} - ${item.DllBase.address}`;
            },
        }
    }
}


/**
 *
 */
function* CheckSec() {
    for (let DllEntry of EnumerateCurrentProcessModules()) {
        let Dll = DllEntry.Entry;
        let DosHeader = host.createTypedObject(Dll.DllBase.address, "ntdll", "_IMAGE_DOS_HEADER");
        let PeHeader = IsX64()
            ? host.createTypedObject(Dll.DllBase.address.add(DosHeader.e_lfanew), "ntdll", "_IMAGE_NT_HEADERS64")
            : host.createTypedObject(Dll.DllBase.address.add(DosHeader.e_lfanew), "ntdll", "_IMAGE_NT_HEADERS32");
        let PeFlags = PeHeader.OptionalHeader.DllCharacteristics;

        let flags = [];
        for (const flagName in g_FlagsToCheck) {
            let flagValue = g_FlagsToCheck[flagName];
            if (PeFlags & flagValue) {
                flags.push(flagName);
            }
        }

        yield {
            ImagePath: DllEntry.Path,
            ImageBase: DosHeader.address,
            Flags: flags.join("|"),
            LoaderEntry: Dll,
            toString() {
                return `${this.ImagePath} - ${this.Flags}`;
            },
        };
    }
}



/**
 *
 */
function checksec() {
    return CheckSec();
}


/**
 *
 */
class ProcessDlls {
    get Dlls() {
        return EnumerateCurrentProcessModules();
    }
}

/**
 *
 */

class SessionModules {
    get Modules() {
        return EnumerateSystemModules();
    }
}


/**
 *
 */
function initializeScript() {
    ok("Adding the commands `Model.Session.Modules`, `Model.Process.Dlls` && `checksec`");

    return [
        new host.apiVersionSupport(1, 3),

        new host.namedModelParent(
            ProcessDlls,
            'Debugger.Models.Process'
        ),

        new host.namedModelParent(
            SessionModules,
            'Debugger.Models.Session'
        ),

        new host.functionAlias(
            checksec,
            "checksec"
        ),

        new host.functionAlias(
            EnumerateSystemModules,
            "SystemModules"
        ),

        new host.functionAlias(
            EnumerateCurrentProcessModules,
            "ProcessModules"
        ),

    ];
}

