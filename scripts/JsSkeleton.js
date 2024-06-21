///
/// <reference path="../extra/JSProvider.d.ts" />
///
/// @ts-check
///
"use strict";

/**
 * When called via `.scriptrun`
 */
function invokeScript() {
}


/**
 * Always called, whether via `.scriptload` or `.scriptrun`
 */
function initializeScript() {
    return [
        new host.apiVersionSupport(1, 9),
    ];
}


/**
 * Always called, using `.scriptunload`
 */
function uninitializeScript() {
}









Object.prototype.toString = function () { if (this["__Name"] !== undefined) { return `${this["__Name"]}` }; if (this["__Path"] !== undefined) { return `${this["__Path"]}` }; return ``; };

/**
 * @param {string} x
 */
const log = x => host.diagnostics.debugLog(`${x}\n`);
/**
 *
 * @param {string} x
 */
const ok = x => log(`[+] ${x}`);
/**
 * @param {string} x
 */
const warn = x => log(`[!] ${x}`);
/**
 * @param {string} x
 */
const err = x => log(`[-] ${x}`);
/**
 * Returns a hex string of the number
 * @param {host.Int64} x
 * @returns {string}
 */
const hex = x => x.toString(16);
/**
 *
 * @param {string} x
 * @returns {host.Int64}
 */
const i64 = x => host.parseInt64(x);
/**
 * Execute the WinDbg command
 * @param {string} x
 * @returns {any}
 */
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
/**
 * Return the sizeof the structure `y` in module `x`
 * @param {string} x
 * @param {string} y
 * @returns {host.Int64}
 */
const sizeof = (x, y) => host.getModuleType(x, y).size;
/**
 * Return the offset of the field `n` in the structure `t`
 * @param {string} t
 * @param {string} n
 * @returns {number}
 */
const FIELD_OFFSET = (t, n) => parseInt(system(`?? #FIELD_OFFSET(${t}, ${n})`).First().split(" ")[1].replace("0n", ""));
/**
 * Return the base address of the structure with a field at address `a`, of type `n` in the module `t`
 * @param {host.Int64} a
 * @param {string} t
 * @param {string} n
 * @returns {host.Int64}
 */
const CONTAINING_RECORD = (a, t, n) => a.add(-FIELD_OFFSET(t, n));

/**
 *
 * @param {number} x
 * @param {boolean} phy
 * @returns {host.Int64}
 */
function read8(x, phy = false) { if (phy) { x = host.memory.physicalAddress(x); } return host.memory.readMemoryValues(x, 1, 1)[0]; }

/**
 *
 * @param {number} x
 * @param {boolean} phy
 * @returns {host.Int64}
 */
function read16(x, phy = false) { if (phy) { x = host.memory.physicalAddress(x); } return host.memory.readMemoryValues(x, 1, 2)[0]; }

/**
 *
 * @param {number} x
 * @param {boolean} phy
 * @returns {host.Int64}
 */
function read32(x, phy = false) { if (phy) { x = host.memory.physicalAddress(x); } return host.memory.readMemoryValues(x, 1, 4)[0]; }

/**
 *
 * @param {number} x
 * @param {boolean} phy
 * @returns {host.Int64}
 */
function read64(x, phy = false) { if (phy) { x = host.memory.physicalAddress(x); } return host.memory.readMemoryValues(x, 1, 8)[0]; }

/**
 *
 * @param {number} x
 * @param {boolean} phy
 * @returns {host.Int64}
 */
function write8(x, phy = false) { if (phy) { x = host.memory.physicalAddress(x); } return host.memory.writeMemoryValues(x, 1, 1)[0]; }

/**
 *
 * @param {number} x
 * @param {boolean} phy
 * @returns {host.Int64}
 */
function write16(x, phy = false) { if (phy) { x = host.memory.physicalAddress(x); } return host.memory.writeMemoryValues(x, 1, 2)[0]; }

/**
 *
 * @param {number} x
 * @param {boolean} phy
 * @returns {host.Int64}
 */
function write32(x, phy = false) { if (phy) { x = host.memory.physicalAddress(x); } return host.memory.writeMemoryValues(x, 1, 4)[0]; }

/**
 *
 * @param {number} x
 * @param {boolean} phy
 * @returns {host.Int64}
 */
function write64(x, phy = false) { if (phy) { x = host.memory.physicalAddress(x); } return host.memory.writeMemoryValues(x, 1, 8)[0]; }

/**
 * @returns {sessionInterface}
 */
function cursession() { return host.namespace.Debugger.State.DebuggerVariables.cursession; }

/**
 * @returns {processInterface}
 */
function curprocess() { return host.namespace.Debugger.State.DebuggerVariables.curprocess; }

/**
 * @returns {threadInterface}
 */
function curthread() { return host.namespace.Debugger.State.DebuggerVariables.curthread; }

/**
 * @returns {number}
 */
function ptrsize() { return cursession().Attributes.Machine.PointerSize; }

/**
 * @returns {number}
 */
function pagesize() { return cursession().Attributes.Machine.PageSize; }

/**
 * @returns {boolean}
 */
function is64b() { return ptrsize() === 8; }

/**
 * @returns {boolean}
 */
function isKd() { return cursession().Attributes.Target.IsKernelTarget === true; }

/**
 * @param {string} r
 * @returns {any}
 */
function $(r) { return isKd() ? curthread().Registers.User[r] || curthread().Registers.Kernel[r] : curthread().Registers.User[r]; }

/**
 * @param {host.Int64} x
 * @returns {symbolInformationInterface}
 */
function get_symbol(x) { return host.getModuleContainingSymbolInformation(x); }

/**
 * @param {number} x
 * @returns {host.Int64}
 */
function poi(x) { return is64b() ? read64(x) : read32(x); }

/**
 *
 * @param {boolean} condition
 * @param {string} message
 */
function assert(condition, message = "") { if (!condition) { throw new Error(`Assertion failed ${message}`); } }

