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



class NotifyCallbackEntry
{
    constructor(_type, addr)
    {
        //
        // See nt!ExAllocateCallBack
        //
        this.__type = _type;
        this.NotifyCallbackAddress = addr
        let StructAddr = this.NotifyCallbackAddress;
        this.PushLock = poi(StructAddr.add(0))
        this.NotifyInformation = poi(StructAddr.add( ptrsize() ));
        this.Flags = poi(StructAddr.add( 2*ptrsize() ));
    }

    FlagsToString()
    {
        let msg = "unknown";

        if (this.__type == "Thread")
        {
            // set to 0 by nt!PsSetCreateThreadNotifyRoutine
            if (this.Flags == 0)
                msg = "None";
            // if not 0 , set by nt!PsSetCreateThreadNotifyRoutineEx
            if (this.Flags == 1)
                msg = "ThreadNotifyNonSystem";
            else if (this.Flags == 2)
                msg = "ThreadNotifySubsystems";
        }
        else if (this.__type == "Process")
        {
            if (this.Flags == 0)
                msg = "None";

            if (this.Flags == 2)
                msg = "ProcessNotifySubsystems";
        }

        return msg;
    }


    CallbackSymbolToString()
    {
        return GetSymbolFromAddress(this.NotifyInformation);;
    }


    toString()
    {
        return `CallbackFn: ${this.CallbackSymbolToString()}, Flags=${this.FlagsToString()}`;
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


    for (let i=0; i<=0x40; i++)
    {
        let offset = i * ptrsize();
        let entry = poi(CallbackTable.add(offset));
        if(entry.compareTo(0) == 0)
            break;

        let _addr = entry.bitwiseAnd(host.parseInt64(-16));
        yield new NotifyCallbackEntry(_type, _addr);
    }
}

function *KdEnumerateCallbacks()
{
    //let ProcessCallbackTable = host.getModuleSymbolAddress("nt", `PspCreateProcessNotifyRoutine`);
    //ok(`nt!PspCreateProcessNotifyRoutine is at 0x${ProcessCallbackTable.toString(16)}`);
    //for (const v of KdEnumerateProcessCallbacks("Process"))
    //    yield v;

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


