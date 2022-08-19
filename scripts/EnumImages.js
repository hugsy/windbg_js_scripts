/// <reference path="../extra/JSProvider.d.ts" />
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

function IsX64() { return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize === 8; }

const IMAGE_FILE_MACHINE_I386 = 0x014c;
const IMAGE_FILE_MACHINE_AMD64 = 0x8664;

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
 * Check various security attributes
 */
class CheckSec {
    constructor(moduleAddress) {
        this.__Address = moduleAddress;
        this.__DosHeader = host.createTypedObject(moduleAddress, "ntdll", "_IMAGE_DOS_HEADER");
        this.__PeHeader = IsX64()
            ? host.createTypedObject(moduleAddress.add(this.__DosHeader.e_lfanew), "ntdll", "_IMAGE_NT_HEADERS64")
            : host.createTypedObject(moduleAddress.add(this.__DosHeader.e_lfanew), "ntdll", "_IMAGE_NT_HEADERS32");
    }

    get Address() {
        return this.__Address;
    }

    get DosHeader() {
        return this.__DosHeader;
    }

    get PeHeader() {
        return this.__PeHeader;
    }

    get Flags() {
        let PeFlags = this.PeHeader.OptionalHeader.DllCharacteristics;
        let flags = [];
        for (const flagName in g_FlagsToCheck) {
            let flagValue = g_FlagsToCheck[flagName];
            if (PeFlags & flagValue) {
                flags.push(flagName);
            }
        }
        return flags;
    }

    toString() {
        return `${this.Flags.join("|")}`;
    }
}

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

    get CheckSec() {
        return new CheckSec(this.BaseAddress);
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

        throw new RangeError("Unable to find specified value");
    }
}


class ProcessModuleIterator extends GenericModuleIterator {
    constructor(process) {
        let ListHead = process.Environment.EnvironmentBlock.Ldr.InLoadOrderModuleList;
        super(ListHead, "ntdll!_LDR_DATA_TABLE_ENTRY");
    }

    toString() {
        return "ProcessModuleIterator";
    }
}


class SystemModuleIterator extends GenericModuleIterator {
    constructor(session) {
        if (session.Attributes.Target.IsKernelTarget === false)
            throw new Error("KD only");

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
class ProcessDlls {
    get Dlls() {
        return new ProcessModuleIterator(this);
    }
}


/**
 *
 */
class SessionModules {
    get Modules() {
        return new SystemModuleIterator(this);
    }
}


/**
 *
 */
function initializeScript() {
    ok("Adding the commands `Model.Session.Modules`, `Model.Process.Dlls`");

    return [
        new host.apiVersionSupport(1, 3),
        new host.namedModelParent(ProcessDlls, 'Debugger.Models.Process'),
        new host.namedModelParent(SessionModules, 'Debugger.Models.Session'),
    ];
}

