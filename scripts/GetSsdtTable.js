///
/// <reference path="../extra/JSProvider.d.ts" />
///
/// @ts-check
///
"use strict";

/**
 *
 * Get the SSDT (nt) as WinDBG convience array
 *
 *
 * Usage:
 * kd> .scriptload \path\to\GetSsdtTable.js
 * kd> dx @$ServiceTable()
 *
 * Example:
 * kd> dx @$ServiceTable().Where( s => s.Name.Contains("nt") ).Count()
 *
 */


const log = x => host.diagnostics.debugLog(`${x}\n`);
const ok = x => log(`[+] ${x}`);
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const u32 = x => host.memory.readMemoryValues(x, 1, 4)[0];
const hex = x => x.toString(16);
const i64 = x => host.parseInt64(x);

function IsX64() { return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize == 8; }
function GetSymbolFromAddress(x) { return system(`.printf "%y", ${hex(x)}`).First(); }


class SsdtEntry {
    constructor(addr, argnum = undefined) {
        this.Address = addr;
        if (argnum !== undefined)
            this.ArgsOnStack = argnum;
    }

    get Symbol() {
        return GetSymbolFromAddress(this.Address);
    }

    toString() {
        let str = `${this.Symbol}`;
        if (IsX64())
            str += ` ArgsOnStack=${this.ArgsOnStack}`;
        return str;
    }
}


class SsdtTable {

    constructor(session) {
        this.__session = session;
        this.__OffsetTable = {};
        this.__IsX64 = IsX64();

        if (this.__IsX64) {
            let NumberOfSyscalls = u32(host.getModuleSymbolAddress("nt", "KiServiceLimit"));
            let SsdtTable = host.getModuleSymbolAddress("nt", "KeServiceDescriptorTable");
            let expr = `**(unsigned int(**)[${NumberOfSyscalls}])0x${hex(SsdtTable)}`;
            this.__OffsetTable = host.evaluateExpression(expr);
            this.__OffsetTableBase = host.getModuleSymbolAddress("nt", "KiServiceTable");
        }
        else {
            let SsdtTable = host.getModuleSymbolAddress("nt", "_KeServiceDescriptorTable");
            let NumberOfSyscalls = u32(host.getModuleSymbolAddress("nt", "_KiServiceLimit"));
            let expr = `**(unsigned int(**)[${NumberOfSyscalls}])0x${hex(SsdtTable)}`;
            this.__OffsetTable = host.evaluateExpression(expr);
            this.__OffsetTableBase = host.getModuleSymbolAddress("nt", "_KiServiceTable");
        }
    }

    getDimensionality() {
        return 1;
    }

    getValueAt(addr) {
        let target_address = i64(addr);
        for (let entry of this.__Entries()) {
            if (entry.Address.compareTo(target_address) == 0) {
                return entry;
            }
        }
        throw new RangeError(`No entry at ${hex(target_address)}`);
    }

    get Count() {
        return this.__OffsetTable.Count();
    }

    *__Entries() {
        for (let i = 0; i < this.Count; i++) {
            let Address = i64(0);

            if (this.__IsX64) {
                Address = this.__OffsetTableBase.add(this.__OffsetTable[i] >> 4);
                yield new SsdtEntry(Address, this.__OffsetTable[i] & 3);
            }
            else {
                Address = this.__OffsetTable[i];
                yield new SsdtEntry(Address);
            }
        }
    }

    *[Symbol.iterator]() {
        for (let entry of this.__Entries()) {
            yield new host.indexedValue(entry, [entry.Address]);
        }
    }

    toString() {
        return "Enumerate the SSDT entries.";
    }
}


class SsdtSessionModel {
    get [Symbol.metadataDescriptor]() {
        return {
            SyscallTable: { Help: "Enumerate the SSDT entries.", },
        };
    }

    get SyscallTable() {
        return new SsdtTable(this);
    }
}

function* ShowSsdtTable() {
    let table = new SsdtTable(null);
    yield* table;
}

function initializeScript() {
    ok("Creating the variable `ssdt` for the SSDT...");

    return [
        new host.apiVersionSupport(1, 3),
        new host.namedModelParent(SsdtSessionModel, 'Debugger.Models.Session'),
        new host.functionAlias(ShowSsdtTable, "ssdt")
    ];
}

