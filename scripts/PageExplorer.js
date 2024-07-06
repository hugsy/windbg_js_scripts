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
function curprocess() { return host.namespace.Debugger.State.DebuggerVariables.curprocess; }

function u32(x, y = false) { if (y) { x = host.memory.physicalAddress(x); } return host.memory.readMemoryValues(x, 1, 4)[0]; }
function u64(x, y = false) { if (y) { x = host.memory.physicalAddress(x); } return host.memory.readMemoryValues(x, 1, 8)[0]; }
function poi(x) { return IsX64() ? u64(x) : u32(x); }

function ProcessDirectoryTableBase() { return curprocess().KernelObject.Pcb.DirectoryTableBase; }
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
    constructor(address, level) {
        this.address = address;
        this.value = u64(this.address, true);
        this.Flags = new PageEntryFlags(this.value.bitwiseAnd(0xfff));
        this.__level = level;

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

    toString() {
        if (!this.Flags.Present)
            return "";
        return `${this.Level} Entry(PA=${hex(this.PhysicalPageAddress)}, ${this.Flags})`;
    }

    *__Walk(only_present) {
        // TODO handle pml5
        if (this.__level >= 5)
            return;

        if (this.__level <= 1)
            return;

        for (let i = 0; i < 512; i++) {
            let pa = this.PhysicalPageAddress.add(i64(i).multiply(8));
            let pte = new PageGenericEntry(pa, this.__level - 1);

            if (!only_present) {
                yield pte;
                continue;
            }

            if (pte.Flags.Present)
                yield pte;
        }
    }

    get Level() {
        switch (this.__level) {
            case 5: return "PML5";
            case 4: return "PML4";
            case 3: return "PDPT";
            case 2: return "PD";
            case 1: return "PT";
        }
        return "";
    }

    get Children() {
        return this.__Walk(false);
    }

    get PresentChildren() {
        return this.__Walk(true);
    }

    get [Symbol.metadataDescriptor]() {
        return {
            Children: { Help: "Enumerate all the children to this node.", }
        };
    }
}


class Pml4Entry extends PageGenericEntry { }
class PageDirectoryPageEntry extends PageGenericEntry { }
class PageDirectoryEntry extends PageGenericEntry { }
class PageTableEntry extends PageGenericEntry { }


class VirtualAddress {
    constructor(addr, cr3) {
        const _ptrsize = ptrsize();
        this.__va = host.parseInt64(addr);
        const PageBase = cr3 ? i64(cr3) : ProcessDirectoryTableBase();
        this.cr3 = PageBase.bitwiseShiftRight(12).bitwiseShiftLeft(12);
        this.pml4e_offset = this.va.bitwiseShiftRight(39).bitwiseAnd(0x1ff);
        this.pdpe_offset = this.va.bitwiseShiftRight(30).bitwiseAnd(0x1ff);
        this.pde_offset = this.va.bitwiseShiftRight(21).bitwiseAnd(0x1ff);

        this.cr3_flags = new Cr3Flags(PageBase.bitwiseAnd(0x18));

        this.pml4e = new Pml4Entry(this.cr3.add(this.pml4e_offset.multiply(_ptrsize)), 4);
        if (!this.pml4e.Flags.Present) { return; }
        this.pdpe = new PageDirectoryPageEntry(this.pml4e.PhysicalPageAddress.add(this.pdpe_offset.multiply(_ptrsize)), 3);
        if (!this.pdpe.Flags.Present) { return; }
        this.pde = new PageDirectoryEntry(this.pdpe.PhysicalPageAddress.add(this.pde_offset.multiply(_ptrsize)), 2);
        if (!this.pde.Flags.Present) { return; }

        if (this.pde.Flags.LargePage) {
            this.offset = this.va.bitwiseAnd(0x1fffff);
            this.pa = this.pde.PhysicalPageAddress.add(this.offset);
        } else {
            this.pte_offset = this.va.bitwiseShiftRight(12).bitwiseAnd(0x1ff);
            this.pte = new PageTableEntry(this.pde.PhysicalPageAddress.add(this.pte_offset.multiply(_ptrsize)), 1);
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

    get va() {
        return this.__va.add(0);
    }
}


/**
 * Equivalent of `!pte`
 * @param {string} va
 * @returns
 */
function PageTableViewer(va) {
    if (!IsKd() || !IsX64()) {
        throw new Error("Only KD+x64");
    }

    if (!va) {
        throw new Error(`invalid address`);
    }

    return new VirtualAddress(i64(va));
}


class VaTree {
    constructor(cr3) {
        this.base = cr3.bitwiseShiftRight(12).bitwiseShiftLeft(12);
    }

    *__Walk(base, level) {
        const _ptrsize = ptrsize();
        for (let i = 0; i < 512; i++) {
            let pa = base.add(i64(i).multiply(_ptrsize));
            let pte = new PageGenericEntry(pa, level);
            yield pte;
        }
    }

    get pml4_table() {
        return this.__Walk(this.base, 4);
    }

}


function PageTableExplorer(cr3) {
    if (!IsKd() || !IsX64()) {
        throw new Error("Only KD+x64");
    }

    const pml = cr3 ? i64(cr3) : ProcessDirectoryTableBase();
    return new VaTree(pml);
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
    let insn = PageTableViewer(addr);
    if (!insn)
        return;
    log(insn.toString());
}


/**
 *
 */
function initializeScript() {
    return [
        new host.apiVersionSupport(1, 9),
        new host.functionAlias(PageTableViewer, "pte2"),
        new host.functionAlias(PageTableExplorer, "ptview"),
        new host.functionAlias(GetPfnEntry, "pfn2"),
        new host.functionAlias(PhysicalAddressToVirtualAddress, "pa2va"),
    ];
}
