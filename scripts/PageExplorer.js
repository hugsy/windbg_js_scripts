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
 * [ ] add range search
 * [ ] !pfn
 * [ ] !pa2va
 */

const DEBUG = false;

const log  = x => host.diagnostics.debugLog(`${x}\n`);
const dbg  = x => {if( DEBUG )log(`[+] ${x}`);};
const ok   = x => log(`[+] ${x}`);
const warn = x => log(`[!] ${x}`);
const err  = x => log(`[-] ${x}`);
const hex  = x => x.toString(16);
const i64  = x => host.parseInt64(`${x}`);
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const evaluate = x => host.evaluateExpression(`${x}`);
const sizeof = x => evaluate(`sizeof(${x})`);

function ptrsize(){ return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize; }
function pagesize(){ return host.namespace.Debugger.State.PseudoRegisters.General.pagesize; }
function IsX64(){ return ptrsize() === 8;}
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }
function $(r){ return IsKd() ? host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.User[r] || host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.Kernel[r] : host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.User[r]; }


function u32(x, k=false){if(!k) return host.memory.readMemoryValues(x, 1, 4)[0];let cmd = `!dd 0x${x.toString(16)}`;let res = system(cmd)[0].split(" ").filter(function(v,i,a){return v.length > 0;});return i64(`0x${res[2].replace("`","")}`);}
function u64(x, k=false){if(!k) return host.memory.readMemoryValues(x, 1, 8)[0];let cmd = `!dq 0x${x.toString(16)}`;let res = system(cmd)[0].split(" ").filter(function(v,i,a){return v.length > 0;});return i64(`0x${res[2].replace("`","")}`);}
function poi(x){ if(IsX64()) return u64(x); else return u32(x);}


var g_pPfnDatabase = undefined;
function GetPfnDatabase()
{
    if (g_pPfnDatabase === undefined)
        g_pPfnDatabase = poi( host.getModuleSymbolAddress("nt", "MmPfnDatabase") );
    return g_pPfnDatabase;
}




class PageEntryFlags
{
    constructor(flags)
    {
        this.__flags = flags;
        /**
        kd> dt nt!_MMPTE_HARDWARE
        +0x000 Valid            : Pos 0, 1 Bit
        +0x000 Dirty1           : Pos 1, 1 Bit
        +0x000 Owner            : Pos 2, 1 Bit
        +0x000 WriteThrough     : Pos 3, 1 Bit
        +0x000 CacheDisable     : Pos 4, 1 Bit
        +0x000 Accessed         : Pos 5, 1 Bit
        +0x000 Dirty            : Pos 6, 1 Bit
        +0x000 LargePage        : Pos 7, 1 Bit
        +0x000 Global           : Pos 8, 1 Bit
        +0x000 CopyOnWrite      : Pos 9, 1 Bit
        +0x000 Unused           : Pos 10, 1 Bit
        +0x000 Write            : Pos 11, 1 Bit
        [...]
        */
        this.Present        = this.__flags.bitwiseAnd( 0b000000000001 ) > 0 ? true : false;
        this.WriteEnabled   = this.__flags.bitwiseAnd( 0b000000000010 ) > 0 ? true : false;
        this.Owner          = this.__flags.bitwiseAnd( 0b000000000100 ) > 0 ? true : false;
        this.WriteThrough   = this.__flags.bitwiseAnd( 0b000000001000 ) > 0 ? true : false;
        this.CacheDisabled  = this.__flags.bitwiseAnd( 0b000000010000 ) > 0 ? true : false;
        this.Accessed       = this.__flags.bitwiseAnd( 0b000000100000 ) > 0 ? true : false;
        this.Dirty          = this.__flags.bitwiseAnd( 0b000001000000 ) > 0 ? true : false;
        this.Global         = this.__flags.bitwiseAnd( 0b000010000000 ) > 0 ? true : false;

        this.NoExecute      = this.__flags.bitwiseAnd( 0x80000000 ) > 0 ? true : false;
    }


    FlagsToString()
    {
        let res = [];
        res.push( (this.Present)?"P":"-" );
        res.push( (this.WriteEnabled)?"Rw":"Rd" );
        res.push( (this.Owner)?"U":"K" );
        res.push( (this.WriteThrough)?"W":"-" );
        res.push( (this.CacheDisabled)?"C":"-" );
        res.push( (this.Accessed)?"A":"-" );
        res.push( (this.Dirty)?"D":"-" );
        res.push( (this.Global)?"G":"-" );
        res.push( (this.NoExecute)?"Nx":"eX" );
        return res.join("")
    }


    toString()
    {
        return `Flags=${this.FlagsToString()}`;
    }
}


class PageGenericEntry
{
    constructor(va)
    {
        this.__raw_value = va;
        this.flags = new PageEntryFlags( va.bitwiseAnd(0b111111111111) );

        /**
        kd> dt nt!_MMPTE_HARDWARE
        [...]
        +0x000 PageFrameNumber  : Pos 12, 36 Bits
        +0x000 ReservedForHardware : Pos 48, 4 Bits
        +0x000 ReservedForSoftware : Pos 52, 4 Bits
        +0x000 WsleAge          : Pos 56, 4 Bits
        +0x000 WsleProtection   : Pos 60, 3 Bits
        */
       this.pfn = this.__raw_value.bitwiseShiftRight(12).bitwiseAnd(0xFFFFFFFFF);
       this.physical_page_address = this.pfn.bitwiseShiftLeft(12);
    }

    get va()
    {
        return GetPfnEntry(this.pfn).PteAddress;
    }
}


class PageTableEntry extends PageGenericEntry
{
   toString() {return `PTE(PA=${hex(this.physical_page_address)}, PFN=${hex(this.pfn)}, ${this.flags})` };
}


class PageDirectoryEntry extends PageGenericEntry
{
    toString() {return `PDE(PA=${hex(this.physical_page_address)}, PFN=${hex(this.pfn)}, ${this.flags})`;}
}



class PagedVirtualAddress
{
    constructor(addr, cr3)
    {
        this.va = i64(addr);
        this.cr3 = i64(cr3);

        this.pml4e_offset = this.va.bitwiseShiftRight(39).bitwiseAnd(0b111111111);
        this.pdpe_offset = this.va.bitwiseShiftRight(30).bitwiseAnd(0b111111111);
        this.pde_offset = this.va.bitwiseShiftRight(21).bitwiseAnd(0b111111111);
        this.pte_offset = this.va.bitwiseShiftRight(12).bitwiseAnd(0b111111111);
        this.offset = this.va.bitwiseAnd(0b111111111111);

        // ok(`pmle4=${hex(this.pml4e_offset)} pdpe=${hex(this.pdpe_offset)} pde=${hex(this.pde_offset)} pte=${hex(this.pte_offset)} off=${hex(this.offset)}`);

        this.pml4e = new PageDirectoryEntry( u64(this.cr3.add(this.pml4e_offset.multiply(ptrsize())), true) );
        this.pdpe = new PageDirectoryEntry( u64(this.pml4e.physical_page_address.add(this.pdpe_offset.multiply(ptrsize())), true) );
        this.pde = new PageDirectoryEntry( u64(this.pdpe.physical_page_address.add(this.pde_offset.multiply(ptrsize())), true) );
        this.pte = new PageTableEntry( u64(this.pde.physical_page_address.add(this.pte_offset.multiply(ptrsize())), true) );

        this.pa = this.pte.physical_page_address.add(this.offset);
    }


    toString()
    {
        return `VA=0x${hex(this.va)}, PA=0x${hex(this.pa)}, Offset=0x${hex(this.offset)}`;
    }
}


function PageTableExplorer(addr)
{
    if ( !IsKd() || !IsX64() )
    {
        err("Only KD+x64");
        return;
    }

    if (addr === undefined)
    {
        err(`invalid address`);
        return;
    }

    return new PagedVirtualAddress( i64(addr), $("cr3"));
}



/**
 *
 */
function GetPfnEntry(idx)
{
    return host.createTypedObject(
        GetPfnDatabase().add( i64(idx).multiply(sizeof("_MMPFN"))),
        "nt",
        "_MMPFN"
    );
}



/**
 *
 */
function PhysicalAddressToVirtualAddress(addr)
{
    // get the pfn index from the physical address
    let pfnIndex = addr.bitwiseShiftRight(12);
    ok(`idx = ${pfnIndex.toString(16)}`);

    //let pfn = new host.typeSystem.arrayDimension(pPfnDatabase, pfnDbLengh, sizeof("_MMPFN")); // bad idea

    // get the pfn entry
    let pfnEntry  = GetPfnEntry(pfnIndex);
    ok(`entry = ${pfnEntry.toString(16)}`);

    // todo finish

    return pfnEntry;
}




/**
 *
 */
function invokeScript(addr)
{
    log(PageTableExplorer(addr).toString());
}


/**
 *
 */
function initializeScript()
{
    return [
        new host.apiVersionSupport(1, 3),
        new host.functionAlias(PageTableExplorer, "pte2"),
        new host.functionAlias(GetPfnEntry, "pfn2"),
        new host.functionAlias(PhysicalAddressToVirtualAddress, "pa2va"),
    ];
}
