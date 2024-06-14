///
/// <reference path="../extra/JSProvider.d.ts" />
///
/// @ts-check
///
/// Template file for new WinDbg JS scripts
///

"use strict";

Object.prototype.toString = function () { if (this.__Name !== undefined) { return `${this.__Name}` }; if (this.__Path !== undefined) { return `${this.__Path}` }; return ``; };

const log = x => host.diagnostics.debugLog(`${x}\n`);
const ok = x => log(`[+] ${x}`);
const warn = x => log(`[!] ${x}`);
const err = x => log(`[-] ${x}`);
const hex = x => x.toString(16);
const i64 = x => host.parseInt64(x);
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const sizeof = (x, y) => host.getModuleType(x, y).size;
const FIELD_OFFSET = (t, n) => parseInt(system(`?? #FIELD_OFFSET(${t}, ${n})`).First().split(" ")[1].replace("0n", ""));
const CONTAINING_RECORD = (a, t, n) => a.substract(FIELD_OFFSET(t, n));

function u8(x, y = false) { if (y) { x = host.memory.physicalAddress(x); } return host.memory.readMemoryValues(x, 1, 1)[0]; }
function u16(x, y = false) { if (y) { x = host.memory.physicalAddress(x); } return host.memory.readMemoryValues(x, 1, 2)[0]; }
function u32(x, y = false) { if (y) { x = host.memory.physicalAddress(x); } return host.memory.readMemoryValues(x, 1, 4)[0]; }
function u64(x, y = false) { if (y) { x = host.memory.physicalAddress(x); } return host.memory.readMemoryValues(x, 1, 8)[0]; }

function cursession() { return host.namespace.Debugger.State.DebuggerVariables.cursession; }
function curprocess() { return host.namespace.Debugger.State.DebuggerVariables.curprocess; }
function curthread() { return host.namespace.Debugger.State.DebuggerVariables.curthreadd; }
function ptrsize() { return cursession().Attributes.Machine.PointerSize; }
function pagesize() { return cursession().Attributes.Machine.PageSize; }
function IsX64() { return ptrsize() === 8; }
function IsKd() { return cursession().Attributes.Target.IsKernelTarget === true; }
function $(r) { return IsKd() ? curthread().Registers.User[r] || curthread().Registers.Kernel[r] : curthread().Registers.User[r]; }
function GetSymbolFromAddress(x) { return system(`.printf "%y", ${x.toString(16)}`).First(); }
function poi(x) { return IsX64() ? u64(x) : u32(x); }
function assert(condition) { if (!condition) { throw new Error("Assertion failed"); } }



class UaFChecker {
    constructor() {
        this.NormalAllocations = [];
        this.WatchedAllocations = [];
        this.__ptrSize = ptrsize();
    }

    * Breakpoints() {
        for (const bp of curprocess().Debug.Breakpoints) {
            if (this.WatchedAllocations.includes(bp.Location)) {
                yield bp;
            }
        }
    }

    GetBreakpointByLocation(location) {
        const MatchLocation = bp => bp.Location.compareTo(location) == 0;
        const bps = [... this.Breakpoints()];
        const idx = bps.findIndex(MatchLocation);
        return (idx > -1) ? bps[idx] : undefined;
    }

    setBreakpoints() {
        this.__allocBp = host.namespace.Debugger.Utility.Control.SetBreakpointAtOffset('RtlAllocateHeap', 0, 'ntdll');
        this.__allocBp.Command = `.if(@r8 > 0){bp /1 @$ra "dx @$uaf().watchLocation(@rax); gc"}; gc`;

        this.__deallocBp = host.namespace.Debugger.Utility.Control.SetBreakpointAtOffset('RtlFreeHeap', 0, 'ntdll');
        this.__deallocBp.Command = `.if(@r8 > 0){dx @$uaf().unwatchLocation(@r8)}; gc`;
    }

    removeBreakpoints() {
        this.__allocBp.Remove();
        this.__deallocBp.Remove();

        for (const bp of this.Breakpoints()) {
            bp.Remove();
        }
    }

    watchLocation(location) {
        if (!this.NormalAllocations.includes(location)) {
            this.unmonitorForUaF(location);
            this.NormalAllocations.push(location);
        }
        return false; // heep running
    }

    monitorForUaF(location) {
        const bp = host.namespace.Debugger.Utility.Control.SetBreakpointForReadWrite(location, "rw", this.__ptrSize);
        bp.Command = "dx @$uaf().notify()";
        this.WatchedAllocations.push(bp.Location);
    }

    unmonitorForUaF(location) {
        const MatchLocation = loc => loc.compareTo(location) == 0;
        const idx = this.WatchedAllocations.findIndex(MatchLocation);
        if (idx > -1) {
            this.WatchedAllocations.splice(idx, 1);
        }
    }

    unwatchLocation(location) {
        const locIdx = this.NormalAllocations.indexOf(location);
        if (locIdx > -1) {
            this.NormalAllocations.splice(locIdx, 1);
            return this.monitorForUaF(location);
        }

        return false; // heep running
    }

    notify() {
        const pc = $('pc');

        warn(``);
        warn(`Possible UaF at ${hex(pc)}`);
        warn(``);

        return true;
    }

    get [Symbol.metadataDescriptor]() {
        return {
            watchLocation: { Help: "Watch a Location.", },
            unwatchLocation: { Help: "Unwatch a Location.", },
        };
    }
}

var uaf = undefined;

function FunctionStarter() {
    if (!uaf) {
        uaf = new UaFChecker();
        uaf.setBreakpoints();
    }

    return uaf;
}


/**
 *
 */
function initializeScript() {
    return [
        new host.apiVersionSupport(1, 7),
        new host.functionAlias(FunctionStarter, "uaf"),
    ];
}


/**
 *
 */
function uninitializeScript() {
    uaf.removeBreakpoints();
}
