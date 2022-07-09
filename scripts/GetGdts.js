///
/// <reference path="../extra/JSProvider.d.ts" />
///
/// @ts-check
///
"use strict";


/**
 *
 * Integrate the GDT to DDM
 *
 */

const log = x => host.diagnostics.debugLog(`${x}\n`);
const ok = x => log(`[+] ${x}`);
const warn = x => log(`[!] ${x}`);
const err = x => log(`[-] ${x}`);
const hex = x => x.toString(16);
const i64 = x => host.parseInt64(x);
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const sizeof = x => i64(system(`?? sizeof(${x})`)[0].split(" ")[2]);
const u8 = x => host.memory.readMemoryValues(x, 1, 1)[0];
const u16 = x => host.memory.readMemoryValues(x, 1, 2)[0];
const u32 = x => host.memory.readMemoryValues(x, 1, 4)[0];
const u64 = x => host.memory.readMemoryValues(x, 1, 8)[0];
const FIELD_OFFSET = (t, n) => parseInt(system(`?? #FIELD_OFFSET(${t}, ${n})`).First().split(" ")[1].replace("0n", ""));
const CONTAINING_RECORD = (a, t, n) => a.substract(FIELD_OFFSET(t, n));

function ptrsize() { return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize; }
function pagesize() { return host.namespace.Debugger.State.PseudoRegisters.General.pagesize; }
function IsX64() { return ptrsize() === 8; }
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }
function $(r) { return IsKd() ? host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.User[r] || host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.Kernel[r] : host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.User[r]; }
function GetSymbolFromAddress(x) { return system(`.printf "%y", ${x.toString(16)}`).First(); }
function poi(x) { return IsX64() ? u64(x) : u32(x); }
function assert(condition) { if (!condition) { throw new Error("Assertion failed"); } }

//
// WinDbg represents the GDT entry `Type` on 5 bits (S|Type) of the Table 3-1 (3.4.5.1) and 3-2
//
const GDT_TYPES_CODE_DATA = {
    0b10000: "Data Read - Only",
    0b10001: "Data Read - Only, accessed",
    0b10010: "Data Read / Write",
    0b10011: "Data Read / Write, accessed",
    0b10100: "Data Read - Only, expand - down",
    0b10101: "Data Read - Only, expand - down, accessed",
    0b10110: "Data Read / Write, expand - down",
    0b10111: "Data Read / Write, expand - down, accessed",
    0b11000: "Code Execute - Only",
    0b11001: "Code Execute - Only, accessed",
    0b11010: "Code Execute / Read",
    0b11011: "Code Execute / Read, accessed",
    0b11100: "Code Execute - Only, conforming",
    0b11101: "Code Execute - Only, conforming, accessed",
    0b11110: "Code Execute / Read, conforming",
    0b11111: "Code Execute / Read, conforming, accessed",
};

const GDT_TYPES_SYSTEM_X86 = {
    0b00000: "Reserved",
    0b00001: "16 - bit TSS(Available)",
    0b00010: "LDT",
    0b00011: "16 - bit TSS(Busy)",
    0b00100: "16 - bit Call Gate",
    0b00101: "Task Gate",
    0b00110: "16 - bit Interrupt Gate",
    0b00111: "16 - bit Trap Gate",
    0b01000: "Reserved",
    0b01001: "32 - bit TSS(Available)",
    0b01010: "Reserved",
    0b01011: "32 - bit TSS(Busy)",
    0b01100: "32 - bit Call Gate",
    0b01101: "Reserved",
    0b01110: "32 - bit Interrupt Gate",
    0b01111: "32 - bit Trap Gate",
};

const GDT_TYPES_SYSTEM_X64 = {
    0b00000: "Reserved",
    0b00001: "Reserved",
    0b00010: "LDT",
    0b00011: "Reserved",
    0b00100: "Reserved",
    0b00101: "Reserved",
    0b00110: "Reserved",
    0b00111: "Reserved",
    0b01000: "Reserved",
    0b01001: "64 - bit TSS(Available)",
    0b01010: "Reserved",
    0b01011: "64 - bit TSS(Busy)",
    0b01100: "64 - bit Call Gate",
    0b01101: "Reserved",
    0b01110: "64 - bit Interrupt Gate",
    0b01111: "64 - bit Trap Gate",
};

const GDT_TYPES_X64 = Object.assign({}, GDT_TYPES_CODE_DATA, GDT_TYPES_SYSTEM_X64);

const GDT_TYPES_X86 = Object.assign({}, GDT_TYPES_CODE_DATA, GDT_TYPES_SYSTEM_X86);


class GdtEntry {

    constructor(core, register, index) {
        this.__CoreIndex = core;
        this.__Register = register;
        this.__Index = index;
        this.__Address = this.__Register.add(this.__Index.multiply(8));
        this.__Object = host.createPointerObject(
            this.__Address,
            "nt",
            "_KGDTENTRY64*"
        );
    }

    toString() {
        return `GdtEntry(@${this.__Address.toString(16)}, Core=${this.__CoreIndex}, Type=${this.Type}, Description="${this.Description}")`;
    }

    get Address() {
        return this.__Address;
    }

    get Object() {
        return this.__Object;
    }

    get Core() {
        return this.__CoreIndex;
    }

    get Description() {
        if (this.IsValid() === false)
            return "Not Present, Not Valid"
        let bIsLongMode = (this.Object.Bits.LongMode.bitwiseAnd(1) === 1);
        return bIsLongMode ? GDT_TYPES_X86[this.Object.Bits.Type] : GDT_TYPES_X64[this.Object.Bits.Type];
    }

    get Type() {
        // From 3.4.5
        // 0 -> System
        // 1 -> Code & Data
        if (this.IsValid() === false)
            return "Invalid";
        if (this.Object.Bits.Type.bitwiseAnd(0b10000).compareTo(0b10000) != 0)
            return "System";
        if (this.Object.Bits.Type.bitwiseAnd(0b11000).compareTo(0b11000) == 0)
            return "Code";
        return "Data";
    }

    IsPresent() {
        return this.Object.Bits.Present === 1;
    }

    IsValid() {
        return this.IsPresent() || this.Object.Bits.Type !== 0;
    }

    IsConforming() {
        const bHasCodeFlag = 0b0100;
        const bHasConformingFlag = bHasCodeFlag & 0b1000;
        return (this.Object.Bits.Type.bitwiseAnd(bHasConformingFlag) === bHasConformingFlag);
    }

}


/**
 * A GDT object
 * The instance is an iterable, whose key is the index of a valid entry, the value the GDT entry associated to this index
 */
class Gdt {

    constructor(CoreIndex) {
        this.__CoreIndex = CoreIndex;
        this.__gdtr = $("gdtr");
        this.__TableEntries = $("gdtl");
        this.__MaxGdtSize = 65536;
        this.__MaxGdtEntries = this.__MaxGdtSize / 8;
        assert(this.__TableEntries < this.__MaxGdtEntries);
    }

    get CoreIndex() {
        return this.__CoreIndex;
    }

    get Register() {
        return this.__gdtr;
    }

    get Size() {
        return this.__TableEntries.multiply(8);
    }

    get Entries() {
        return this.__TableEntries;
    }

    toString() {
        return `Gdt(gdtr=@${this.__gdtr.toString(16)}, Core=${this.__CoreIndex})`;
    }

    *[Symbol.iterator]() {
        for (let i = 0; i < this.__TableEntries; i++) {
            let entry = new GdtEntry(this.__CoreIndex, this.__gdtr, i);
            if (entry.IsValid())
                yield new host.indexedValue(entry, [i]);
        }
    }

    getDimensionality() {
        return 1;
    }

    getValueAt(index) {
        assert(index < this.__TableEntries);
        return new GdtEntry(this.__CoreIndex, this.__gdtr, index);
    }
}


/**
 * Iterate through all GDTs.
 * The instance is an iterable, whose key is the processor number, the value the GDT associated to the processor
 */
class GdtIterator {
    constructor() {
        this.__NumberOfProcessors = u32(host.getModuleSymbolAddress("nt", "KeNumberProcessors"));
    }

    get NumberOfProcessors() {
        return this.__NumberOfProcessors;
    }

    *[Symbol.iterator]() {
        for (let i = 0; i < this.__NumberOfProcessors; i++) {
            this.SetCurrentProcessor(i);
            yield new host.indexedValue(new Gdt(i), [i]);
        }
    }

    getDimensionality() {
        return 1;
    }

    getValueAt(core) {
        assert(core < this.__NumberOfProcessors);
        this.SetCurrentProcessor(core);
        return new Gdt(core);
    }

    SetCurrentProcessor(Index) {
        system(`~${Index}s`);
    }
}


/**
 * Declare the extension as part of the DDM, under Thread model
 */
class GdtExtension {
    get GlobalDescriptorTable() {
        return new GdtIterator();
    }
}


/**
 * Dump the GDT for all cores
 */
function invokeScript() {
    return new GdtIterator();
}


/*
 *
 */
function initializeScript() {
    log("[+] Creating the variable `GlobalDescriptorTable` to each thread...");

    return [
        new host.namedModelParent(GdtExtension, "Debugger.Models.Thread"),
        new host.apiVersionSupport(1, 3)
    ];

}


/**
 *
 */
function uninitializeScript() {
}
