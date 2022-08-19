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

class ModuleEntry {
    constructor(Entry) {
        this.__Entry = Entry;
    }

    get Name() {
        return this.__Entry.BaseDllName.ToDisplayString().slice(1, -1);
    }

    get Path() {
        return this.__Entry.FullDllName.ToDisplayString().slice(1, -1);
    }

    get BaseAddress() {
        return this.__Entry.DllBase.address;
    }

    get Entry() {
        return this.__Entry;
    }

    toString() {
        return `${this.Path}`;
    }
}

class GenericModuleIterator {
    constructor(ListHead, TypeName) {
        this.__ListHead = ListHead;
        this.__TypeName = TypeName;
    }

    Iterator() {
        return host.namespace.Debugger.Utility.Collections.FromListEntry(
            this.__ListHead,
            this.__TypeName,
            "InLoadOrderLinks"
        );
    }

    *[Symbol.iterator]() {
        for (let mod of this.Iterator()) {
            let entry = new ModuleEntry(mod);
            let index = entry.BaseAddress;
            yield new host.indexedValue(entry, [index]);
        }
    }

    toString() {
        throw new Error();
    }

    getDimensionality() {
        return 1;
    }

    getValueAt(address) {
        for (let item of this.Iterator()) {
            let entry = new ModuleEntry(item);
            if (entry.BaseAddress.compareTo(address) == 0) {
                return entry;
            }
        }

        return undefined;
    }
}


class ProcessModuleIterator extends GenericModuleIterator {
    constructor() {
        let Peb = IsKd() ? curprocess().KernelObject.Peb : host.namespace.Debugger.State.PseudoRegisters.General.peb;
        let ListHead = Peb.Ldr.InLoadOrderModuleList;
        super(ListHead, "ntdll!_LDR_DATA_TABLE_ENTRY");
    }

    toString() {
        return "ProcessModuleIterator";
    }
}


class SystemModuleIterator extends GenericModuleIterator {
    constructor() {
        let PsLoadedModuleHead = host.createPointerObject(
            host.getModuleSymbolAddress("nt", "PsLoadedModuleList"),
            "nt",
            "_LDR_DATA_TABLE_ENTRY *"
        );
        let ListHead = PsLoadedModuleHead.InLoadOrderLinks;
        super(ListHead, "nt!_LDR_DATA_TABLE_ENTRY");
    }

    toString() {
        return "SystemModuleIterator";
    }
}


/**
 *
 */
function* checksec() {
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
class ProcessDlls {
    get Dlls() {
        return new ProcessModuleIterator();
    }
}

/**
 *
 */

class SessionModules {
    get Modules() {
        return new SystemModuleIterator();
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
    ];
}

