///
/// <reference path="../extra/JSProvider.d.ts" />
///
/// @ts-check
///
"use strict";


/**
 *
 * !pte replacement
 *
 * todo:
 * [ ] add permission
 * [ ] add pfn
 */

const DEBUG = true;


const log  = x => host.diagnostics.debugLog(`${x}\n`);
const dbg  = x => {if( DEBUG )log(`[+] ${x}`);};
const ok   = x => log(`[+] ${x}`);
const warn = x => log(`[!] ${x}`);
const err  = x => log(`[-] ${x}`);
const hex  = x => x.toString(16);
const i64  = x => host.parseInt64(x);
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const evaluate = x => host.evaluateExpression(`${x}`);
const sizeof = x => evaluate(`sizeof(${x})`);

function ptrsize(){ return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize; }
function pagesize(){ return host.namespace.Debugger.State.PseudoRegisters.General.pagesize; }
function IsX64(){ return ptrsize() === 8;}
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }
function $(r){ return IsKd() ? host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.User[r] || host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.Kernel[r] : host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.User[r]; }


function u32(x, k=false){if(!k) return host.memory.readMemoryValues(x, 1, 4)[0];let cmd = `!dd 0x${x.toString(16)} l1`;let res = system(cmd)[0].split(" ");let p = res[res.length - 1];return i64(`0x${p.replace("`","")}`);}
function u64(x, k=false){if(!k) return host.memory.readMemoryValues(x, 1, 8)[0];let cmd = `!dq 0x${x.toString(16)} l1`;let res = system(cmd)[0].split(" ");let p = res[res.length - 1];return i64(`0x${p.replace("`","")}`);}



class PagedVirtualAddress
{
    constructor(addr, cr3)
    {
        this.va = i64(addr);
        this.cr3 = i64(cr3);

        this.pml4_offset = this.va.bitwiseShiftRight(39).bitwiseAnd( 0b111111111);
        this.pml4 = this.cr3.add(this.pml4_offset.multiply(ptrsize()));

        this.pdpt_offset = this.va.bitwiseShiftRight(30).bitwiseAnd( 0b111111111);
        this.pdpt_base = u64(this.pml4, true).bitwiseAnd(~0b111111111111);
        this.pdpt = this.pdpt_base.add(this.pdpt_offset.multiply(ptrsize()));

        this.pd_offset = this.va.bitwiseShiftRight(21).bitwiseAnd(0b111111111);
        this.pd_base = u64(this.pdpt, true).bitwiseAnd(~0b111111111111);
        this.pd = this.pd_base.add(this.pd_offset.multiply(ptrsize()));

        this.pt_offset = this.va.bitwiseShiftRight(12).bitwiseAnd(0b111111111);
        this.pt_base = u64(this.pd, true).bitwiseAnd(~0b111111111111);
        this.pt = this.pt_base.add(this.pt_offset.multiply(ptrsize()));

        this.offset = this.va.bitwiseAnd(0b111111111111);

        this.pa = u64(this.pt, true).bitwiseShiftLeft(8).bitwiseShiftRight(8).bitwiseAnd(~0b111111111111).add(this.offset);
    }


    toString()
    {
        return `VA=0x${hex(this.va)} (PML4=0x${hex(this.pml4)} PDPT=0x${hex(this.pdpt)} PD=0x${hex(this.pd)} PT=0x${hex(this.pt)} Offset=0x${hex(this.offset)})`;
    }
}


function PageExplorer(addr)
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

    //
    // collect all offsets from VA
    //
    let address = i64(addr);
    let paged_va = new PagedVirtualAddress(address, $("cr3"));
    return paged_va;
}



/**
 *
 */
function invokeScript(addr)
{
    log(PageExplorer(addr).toString());
}


/**
 *
 */
function initializeScript()
{
    return [
        new host.apiVersionSupport(1, 3),
        new host.functionAlias(PageExplorer, "pte"),
    ];
}


/**
 *
 */
function uninitializeScript()
{
}
