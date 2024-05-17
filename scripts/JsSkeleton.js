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

function read8(x, phy = false) { if (phy) { x = host.memory.physicalAddress(x); } return host.memory.readMemoryValues(x, 1, 1)[0]; }
function read16(x, phy = false) { if (phy) { x = host.memory.physicalAddress(x); } return host.memory.readMemoryValues(x, 1, 2)[0]; }
function read32(x, phy = false) { if (phy) { x = host.memory.physicalAddress(x); } return host.memory.readMemoryValues(x, 1, 4)[0]; }
function read64(x, phy = false) { if (phy) { x = host.memory.physicalAddress(x); } return host.memory.readMemoryValues(x, 1, 8)[0]; }
function write8(x, phy = false) { if (phy) { x = host.memory.physicalAddress(x); } return host.memory.writeMemoryValues(x, 1, 1)[0]; }
function write16(x, phy = false) { if (phy) { x = host.memory.physicalAddress(x); } return host.memory.writeMemoryValues(x, 1, 2)[0]; }
function write32(x, phy = false) { if (phy) { x = host.memory.physicalAddress(x); } return host.memory.writeMemoryValues(x, 1, 4)[0]; }
function write64(x, phy = false) { if (phy) { x = host.memory.physicalAddress(x); } return host.memory.writeMemoryValues(x, 1, 8)[0]; }

function cursession() { return host.namespace.Debugger.State.DebuggerVariables.cursession; }
function curprocess() { return host.namespace.Debugger.State.DebuggerVariables.curprocess; }
function curthread() { return host.namespace.Debugger.State.DebuggerVariables.curthread; }
function ptrsize() { return cursession().Attributes.Machine.PointerSize; }
function pagesize() { return cursession().Attributes.Machine.PageSize; }
function is64b() { return ptrsize() === 8; }
function isKd() { return cursession().Attributes.Target.IsKernelTarget === true; }
function $(r) { return isKd() ? curthread().Registers.User[r] || curthread().Registers.Kernel[r] : curthread().Registers.User[r]; }
function GetSymbolFromAddress(x) { return system(`.printf "%y", ${x.toString(16)}`).First(); }
function poi(x) { return is64b() ? read64(x) : read32(x); }
function assert(condition, message="") { if (!condition) { throw new Error(`Assertion failed ${message}`); } }


/**
 *
 */
function invokeScript() {
}


/**
 *
 */
function initializeScript() {
    return [
        new host.apiVersionSupport(1, 7),
    ];
}


/**
 *
 */
function uninitializeScript() {
}
