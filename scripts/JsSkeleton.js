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
function ptrsize() { return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize; }
function pagesize() { return host.namespace.Debugger.State.PseudoRegisters.General.pagesize; }
function IsX64() { return ptrsize() === 8; }
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }
function $(r) { return IsKd() ? host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.User[r] || host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.Kernel[r] : host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.User[r]; }
function GetSymbolFromAddress(x) { return system(`.printf "%y", ${x.toString(16)}`).First(); }
function poi(x) { return IsX64() ? u64(x) : u32(x); }
function assert(condition) { if (!condition) { throw new Error("Assertion failed"); } }


/**
 *
 */
function invokeScript() {
}


/**
 *
 */
function initializeScript() {
}


/**
 *
 */
function uninitializeScript() {
}
