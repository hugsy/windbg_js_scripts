///
/// <reference path="../extra/JSProvider.d.ts" />
///
/// @ts-check
///
"use strict";

/**
 *
 * !pte replacement - but way slower because there's no primitive for read/write physical memory in JS
 *
 * To load:
 * kd> .scriptload \\path\to\PageExplorer.js"
 *
 * To use:
 * kd> dx @$pte(0xFFFFF78000000000)
 * or
 * kd> dx @$pte( @rip )
 * @$pte(@rbx)                 : VA=0xffff800ad9943830, PA=0x54ad830, Offset=0x830
 *   va               : 0xffff800ad9943830
 *   cr3              : 0x1aa002
 *   pml4e_offset     : 0x100
 *   pdpe_offset      : 0x2b
 *   pde_offset       : 0xcc
 *   pte_offset       : 0x143
 *   offset           : 0x830
 *   pml4e            : PDE(PA=1239000, PFN=1239, Flags=PRwU--AD-eX)
 *   pdpe             : PDE(PA=123c000, PFN=123c, Flags=PRwU--AD-eX)
 *   pde              : PDE(PA=2fca000, PFN=2fca, Flags=PRwU--AD-eX)
 *   pte              : PTE(PA=54ad000, PFN=54ad, Flags=PRwU--AD-eX)
 *   pa               : 0x54ad830
 *
 *
 * todo:
 * [ ] !pa2va
 */

const DEBUG = true;

const log = x => host.diagnostics.debugLog(`${x}\n`);
const dbg = x => { if (DEBUG) log(`[*] ${x}`); };
const ok = x => log(`[+] ${x}`);
const warn = x => log(`[!] ${x}`);
const err = x => log(`[-] ${x}`);
const hex = x => x.toString(16);
const i64 = x => host.parseInt64(`${x}`);
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const sizeof = (x, y) => host.getModuleType(x, y).size;

const LARGE_PAGE_SIZE = 0x200000;
const NORMAL_PAGE_SIZE = 0x1000;

function ptrsize() { return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize; }
function pagesize(isLarge = false) { return isLarge ? LARGE_PAGE_SIZE : NORMAL_PAGE_SIZE; }
function IsX64() { return ptrsize() === 8; }
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }
function $(r) { return IsKd() ? host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.User[r] || host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.Kernel[r] : host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.User[r]; }

function u32(x, y = false) { if (y) { x = host.memory.physicalAddress(x); } return host.memory.readMemoryValues(x, 1, 4)[0]; }
function u64(x, y = false) { if (y) { x = host.memory.physicalAddress(x); } return host.memory.readMemoryValues(x, 1, 8)[0]; }
function poi(x) { if (IsX64()) return u64(x); else return u32(x); }

function ProcessDirectoryTableBase() { return host.namespace.Debugger.State.DebuggerVariables.curprocess.KernelObject.Pcb.DirectoryTableBase; }
function GetPfnDatabase() { return poi(host.getModuleSymbolAddress("nt", "MmPfnDatabase")); }


class PageEntryFlags {
    constructor(flags) {
        this.Raw = flags;
        this.Present = flags.bitwiseAnd(0b000000000001) > 0;
        this.ReadWrite = flags.bitwiseAnd(0b000000000010) > 0;
        this.UserSupervisor = flags.bitwiseAnd(0b000000000100) > 0;
        this.WriteThrough = flags.bitwiseAnd(0b000000001000) > 0;
        this.CacheDisabled = flags.bitwiseAnd(0b000000010000) > 0;
        this.Accessed = flags.bitwiseAnd(0b000000100000) > 0;
        this.Dirty = flags.bitwiseAnd(0b000001000000) > 0;
        this.LargePage = flags.bitwiseAnd(0b000010000000) > 0;
        this.Global = flags.bitwiseAnd(0b000100000000) > 0;
    }

    FlagsToString() {
        const str = [
            this.Present ? "P" : "-",
            this.ReadWrite ? "RW" : "RO",
            this.UserSupervisor ? "U" : "K",
            this.WriteThrough ? "W" : "-",
            this.CacheDisabled ? "C" : "-",
            this.Accessed ? "A" : "-",
            this.Dirty ? "D" : "-",
            this.LargePage ? "LG" : "-",
            this.Global ? "G" : "-",
        ].join(" ");
        return `[${str}]`;
    }

    toString() { return `Flags=${this.FlagsToString()}`; }
}

class Cr3Flags {
    constructor(flags) {
        this.Raw = flags;
        this.WriteThrough = flags.bitwiseAnd(0b000000001000) > 0;
        this.CacheDisabled = flags.bitwiseAnd(0b000000010000) > 0;
    }

    toString() {
        const str = [
            this.WriteThrough ? "W" : "-",
            this.CacheDisabled ? "C" : "-",
        ].join(" ");
        return `[${str}]`;
    }
}

class PageGenericEntry {
    constructor(address) {
        this.address = address;
        this.value = u64(this.address, true);
        this.Flags = new PageEntryFlags(this.value.bitwiseAnd(0xfff));

        /**
        kd> dt nt!_MMPTE_HARDWARE
        [...]
        +0x000 PageFrameNumber  : Pos 12, 36 Bits
        +0x000 ReservedForHardware : Pos 48, 4 Bits
        +0x000 ReservedForSoftware : Pos 52, 4 Bits
        +0x000 WsleAge          : Pos 56, 4 Bits
        +0x000 WsleProtection   : Pos 60, 3 Bits
        */
        if (this.Flags.LargePage) {
            this.PageFrameNumber = this.value
                .bitwiseShiftRight(21).bitwiseAnd(0x3fffffff); // 30 bits
            this.Pfn = GetPfnEntry(this.PageFrameNumber);
            this.PhysicalPageAddress = this.PageFrameNumber.bitwiseShiftLeft(21);
        } else {
            this.PageFrameNumber = this.value
                .bitwiseShiftRight(12).bitwiseAnd(0xfffffffff);
            this.Pfn = GetPfnEntry(this.PageFrameNumber);
            this.PhysicalPageAddress = this.PageFrameNumber.bitwiseShiftLeft(12);
        }
    }

    get Pte() {
        return this.Pfn.PteAddress;
    }
}


class PageTableEntry extends PageGenericEntry {
    toString() { return `PTE(PA=${hex(this.PhysicalPageAddress)}, PFN=${hex(this.PageFrameNumber)}, ${this.Flags})` };
}


class PageDirectoryEntry extends PageGenericEntry {
    toString() { return `PDE(PA=${hex(this.PhysicalPageAddress)}, PFN=${hex(this.PageFrameNumber)}, ${this.Flags})`; }
}


class PagedVirtualAddress {
    constructor(addr) {
        const _ptrsize = ptrsize();
        this.va = addr;
        const PageBase = ProcessDirectoryTableBase();
        this.cr3 = PageBase.bitwiseShiftRight(12).bitwiseShiftLeft(12);
        this.pml4e_offset = this.va.bitwiseShiftRight(39).bitwiseAnd(0x1ff);
        this.pdpe_offset = this.va.bitwiseShiftRight(30).bitwiseAnd(0x1ff);
        this.pde_offset = this.va.bitwiseShiftRight(21).bitwiseAnd(0x1ff);

        this.cr3_flags = new Cr3Flags(PageBase.bitwiseAnd(0x18));

        this.pml4e = new PageDirectoryEntry(this.cr3.add(this.pml4e_offset.multiply(_ptrsize)));
        if (!this.pml4e.Flags.Present) { return; }
        this.pdpe = new PageDirectoryEntry(this.pml4e.PhysicalPageAddress.add(this.pdpe_offset.multiply(_ptrsize)));
        if (!this.pdpe.Flags.Present) { return; }
        this.pde = new PageDirectoryEntry(this.pdpe.PhysicalPageAddress.add(this.pde_offset.multiply(_ptrsize)));
        if (!this.pde.Flags.Present) { return; }

        if (this.pde.Flags.LargePage) {
            this.offset = this.va.bitwiseAnd(0x1fffff);
            this.pa = this.pde.PhysicalPageAddress.add(this.offset);
        } else {
            this.pte_offset = this.va.bitwiseShiftRight(12).bitwiseAnd(0x1ff);
            this.pte = new PageTableEntry(this.pde.PhysicalPageAddress.add(this.pte_offset.multiply(_ptrsize)));
            if (!this.pte.Flags.Present) { return; }
            this.offset = this.va.bitwiseAnd(0xfff);
            this.pa = this.pte.PhysicalPageAddress.add(this.offset);
        }
    }

    get kernel_pxe() {
        // equiv. to nt!MiGetPteAddress()
        let pte_base = poi(host.getModuleSymbolAddress("nt", "MmPteBase"));
        return pte_base.add(this.va.bitwiseShiftRight(9).bitwiseAnd(0x7ffffffff8));
    }

    toString() {
        return `VA=0x${hex(this.va)}, PA=0x${hex(this.pa)}, Offset=0x${hex(this.offset)}`;
    }
}


function PageTableExplorer(addr) {
    if (!IsKd() || !IsX64()) {
        err("Only KD+x64");
        return;
    }

    if (addr === undefined) {
        err(`invalid address`);
        return;
    }

    return new PagedVirtualAddress(i64(addr));
}



/**
 *
 */
function GetPfnEntry(idx) {
    const addr = GetPfnDatabase().add(i64(idx).multiply(sizeof("nt", "_MMPFN")));
    return host.createTypedObject(addr, "nt", "_MMPFN");
}



/**
 *
 */
function PhysicalAddressToVirtualAddress(addr) {
    // get the pfn index from the physical address
    let pfnIndex = addr.bitwiseShiftRight(12);
    ok(`idx = ${pfnIndex.toString(16)}`);

    //let pfn = new host.typeSystem.arrayDimension(pPfnDatabase, pfnDbLengh, sizeof("_MMPFN")); // bad idea

    // get the pfn entry
    let pfnEntry = GetPfnEntry(pfnIndex);
    ok(`entry = ${pfnEntry.toString(16)}`);

    // todo finish

    return pfnEntry;
}




/**
 *
 */
function invokeScript(addr) {
    log(PageTableExplorer(addr).toString());
}


/**
 *
 */
function initializeScript() {
    return [
        new host.apiVersionSupport(1, 7),
        new host.functionAlias(PageTableExplorer, "pte2"),
        new host.functionAlias(GetPfnEntry, "pfn2"),
        new host.functionAlias(PhysicalAddressToVirtualAddress, "pa2va"),
    ];
}
