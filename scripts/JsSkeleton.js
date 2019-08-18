///
/// <reference path="JSProvider.d.ts" />
///
"use strict";


/**
 *
 * Template file for new WinDbg JS scripts
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

function IsX64(){ return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize === 8;}
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }
function $(r){ if(!IsKd()) return host.currentThread.Registers.User[r]; else return host.namespace.Debugger.State.DebuggerVariables.curprocess.Threads.First().Registers.User[r] || host.namespace.Debugger.State.DebuggerVariables.curprocess.Threads.First().Registers.Kernel[r]; }
function GetSymbolFromAddress(x){ return system(`.printf "%y", ${x.toString(16)}`).First(); }


/**
 *
 */
function invokeScript()
{
}


/**
 *
 */
function initializeScript()
{
}


/**
 *
 */
function uninitializeScript()
{
}
