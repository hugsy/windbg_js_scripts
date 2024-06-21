///
/// <reference path="../extra/JSProvider.d.ts" />
///
/// @ts-check
///
"use strict";


/**
 *
 * Enumerate some well-known callback locations
 *
 */

const log = x => host.diagnostics.debugLog(`${x}\n`);
const ok = x => log(`[+] ${x}`);
const warn = x => log(`[!] ${x}`);
const err = x => log(`[-] ${x}`);
const hex = x => x.toString(16);
const i64 = x => host.parseInt64(x);
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const u8 = x => host.memory.readMemoryValues(x, 1, 1)[0];
const u16 = x => host.memory.readMemoryValues(x, 1, 2)[0];
const u32 = x => host.memory.readMemoryValues(x, 1, 4)[0];
const u64 = x => host.memory.readMemoryValues(x, 1, 8)[0];

function cursession() { return host.namespace.Debugger.State.DebuggerVariables.cursession; }
function curprocess() { return host.namespace.Debugger.State.DebuggerVariables.curprocess; }
function ptrsize() { return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize; }
function IsX64() { return ptrsize() === 8; }
function IsKd() { return cursession().Attributes.Target.IsKernelTarget === true; }
function GetSymbolFromAddress(x) { return system(`.printf "%y", ${x.toString(16)}`).First(); }
function poi(x) { return IsX64() ? u64(x) : u32(x); }



class NotifyCallbackEntry {
    constructor(_type, addr) {
        //
        // See nt!ExAllocateCallBack
        //
        this.Type = _type;
        this.NotifyCallbackAddress = addr
        let StructAddr = this.NotifyCallbackAddress;
        this.PushLock = poi(StructAddr.add(0))
        this.NotifyInformation = poi(StructAddr.add(ptrsize()));
        this.Flags = poi(StructAddr.add(2 * ptrsize()));
    }

    FlagsToString() {
        let msg = "";

        if (this.Type === "CreateThread") {
            // set to 0 by nt!PsSetCreateThreadNotifyRoutine
            if (this.Flags == 0)
                msg = "None";
            // if not 0 , set by nt!PsSetCreateThreadNotifyRoutineEx
            else if (this.Flags == 1)
                msg = "ThreadNotifyNonSystem";
            else if (this.Flags == 2)
                msg = "ThreadNotifySubsystems";

            else
                msg = `0x${this.Flags.toString(16)}`;

        }
        else if (this.Type === "CreateProcess") {
            if (this.Flags == 0)
                msg = "None";

            else if (this.Flags == 2)
                msg = "ProcessNotifySubsystems";

            else
                msg = `0x${this.Flags.toString(16)}`;
        }

        return msg;
    }


    CallbackSymbolToString() {
        return GetSymbolFromAddress(this.NotifyInformation);;
    }


    toString() {
        let msg = `${this.Type}(${this.CallbackSymbolToString()}`;
        if (this.FlagsToString().length > 0) {
            msg += `, Flags: ${this.FlagsToString()}`;
        }
        msg += `)`;
        return msg;
    }
}



function* EnumGenericCallbacks(_type) {
    let CallbackTable = host.getModuleSymbolAddress("nt", `Psp${_type}NotifyRoutine`);
    let i = 0;


    for (let i = 0; i <= 0x40; i++) {
        let offset = i * ptrsize();
        let entry = poi(CallbackTable.add(offset));
        if (entry.compareTo(0) == 0)
            break;

        let _addr = entry.bitwiseAnd(-16);
        yield new NotifyCallbackEntry(_type, _addr);
    }
}


function* EnumShutdownCallbacks() {

}

/**
 * TODO:
  - nt!IopDiskFileSystemQueueHead
  - nt!IopCdRomFileSystemQueueHead
  - nt!IopTapeFileSystemQueueHead
- System shutdown
 - nt!IopNotifyShutdownQueueHead
 - nt!IopNotifyLastChanceShutdownQueueHead
- Registry
 - nt!CallbackListHead
- BugCheck
 - nt!KeBugCheckCallbackListHead
 - nt!KeBugCheckReasonCallbackListHead
 - nt!KeBugCheckTriageDumpDataArrayListHead
 - nt!KeBugCheckAddRemovePagesCallbackListHead
- Debug
 - nt!RtlpDebugPrintCallback
- PnP
 - nt!PnpProfileNotifyList
 - nt!PnpDeviceClassNotifyList
 */


function* KdEnumerateCallbacks(_type) {
    if (!IsKd()) {
        err("KD only");
        return;
    }

    if (_type == "process") {
        for (const v of EnumGenericCallbacks("CreateProcess")) { yield v; }
    }
    if (_type == "thread") {
        for (const v of EnumGenericCallbacks("CreateThread")) { yield v; }
    }
    if (_type == "image") {
        for (const v of EnumGenericCallbacks("LoadImage")) { yield v; }
    }
}


/**
 *
 */
function invokeScript() {
    KdEnumerateCallbacks()
}


/**
 *
 */
function initializeScript() {
    return [
        new host.apiVersionSupport(1, 3),
        new host.functionAlias(KdEnumerateCallbacks, "kcb"),
    ];
}


