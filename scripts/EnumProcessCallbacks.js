///
/// <reference path="JSProvider.d.ts" />
///
/// @ts-check
///
"use strict";


/**
 *
 * Kd only:
 *
 * Uses nt!PspCreateProcessNotifyRoutine to enumerate all the Process callbacks
 * (from nt!PspCallProcessNotifyRoutines)
 *
 */

const log  = x => host.diagnostics.debugLog(`${x}\n`);
const ok   = x => log(`[+] ${x}`);
const warn = x => log(`[!] ${x}`);
const err  = x => log(`[-] ${x}`);
const hex  = x => x.toString(16);
const i64  = x => host.parseInt64(x);
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const sizeof = x => host.evaluateExpression(`sizeof(${x})`);
const  u8 = x => host.memory.readMemoryValues(x, 1, 1)[0];
const u16 = x => host.memory.readMemoryValues(x, 1, 2)[0];
const u32 = x => host.memory.readMemoryValues(x, 1, 4)[0];
const u64 = x => host.memory.readMemoryValues(x, 1, 8)[0];

function ptrsize(){ return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize; }
function IsX64(){ return ptrsize() === 8;}
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }
function GetSymbolFromAddress(x){ return system(`.printf "%y", ${x.toString(16)}`).First(); }
function poi(x){ return IsX64() ? u64(x) : u32(x); }



class CallbackEntry
{
    constructor(val, addr)
    {
        this.Address = addr
        this.Unk1 = val
        this.Type = poi(this.Address);
        this.CallbackAddress = poi( this.Address.add( ptrsize() ) );
        this.CallbackSymbol = GetSymbolFromAddress(this.CallbackAddress)
    }


    typeToString()
    {

        return `0x${this.Type.toString(16)}`;
    }


    toString()
    {
        let str = `(${this.CallbackAddress.toString(16)}) ${this.CallbackSymbol} - ${this.typeToString()}`;
        return str;
    }
}



function *KdEnumerateProcessCallbacks(_type)
{
    if(!IsKd())
    {
        err("KdOnly");
        return;
    }

    let RundownTable = [];
    let CallbackTable = host.getModuleSymbolAddress("nt", `PspCreate${_type}NotifyRoutine`);
    let i = 0;


    while (true)
    {
        let entry = poi(CallbackTable.add(i));
        if(entry.compareTo(0) == 0)
            break;

        let _type = entry.bitwiseAnd(0xf);
        let _addr = entry.subtract(_type);

        yield new CallbackEntry(_type, _addr);
        i += ptrsize();
    }
}

function *KdEnumerateCallbacks()
{
    //let ProcessCallbackTable = host.getModuleSymbolAddress("nt", `PspCreateProcessNotifyRoutine`);
    //ok(`nt!PspCreateProcessNotifyRoutine is at 0x${ProcessCallbackTable.toString(16)}`);
    for (const v of KdEnumerateProcessCallbacks("Process"))
        yield v;

    //let ThreadCallbackTable = host.getModuleSymbolAddress("nt", `PspCreateThreadNotifyRoutine`);
    //ok(`nt!PspCreateThreadNotifyRoutine is at 0x${ThreadCallbackTable.toString(16)}`);
    for (const v of KdEnumerateProcessCallbacks("Thread"))
        yield v;
}

/**
 *
 */
function invokeScript()
{
    KdEnumerateCallbacks()
}


/**
 *
 */
function initializeScript()
{
    return [
        new host.apiVersionSupport(1, 3),
        new host.functionAlias(KdEnumerateCallbacks, "enumcb"),
    ];
}


