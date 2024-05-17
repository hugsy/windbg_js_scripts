///
/// <reference path="../extra/JSProvider.d.ts" />
///
/// @ts-check
///
"use strict";


/**
 *
 * Integrate the GDT & IDT to DDM as part of the current thread context
 * Also creates `@$Gdt()` and `@$Idt()` indexed array
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


class EntryGeneric {

    constructor(core, register, index) {
        this.__CoreIndex = core;
        this.__Register = register;
        this.__Index = index;

        // Must be defined
        this.__typeName = null;
        this.__Address = null;
        this.__Object = null;
    }

    toString() {
        throw new Error("Can't instantiate abstract class!");
    }

    get Name() {
        return this.__typeName;
    }

    get Address() {
        return this.__Address;
    }

    get Object() {
        return this.__Object;
    }

    get CoreIndex() {
        return this.__CoreIndex;
    }

    get Description() {
        if (this.IsValid() === false)
            return "Not Present, Not Valid";
        if (this.Object.Bits === undefined)
            return "";
        let bIsLongMode = (this.Object.Bits.LongMode.bitwiseAnd(1) === 1);
        return bIsLongMode ? GDT_TYPES_X86[this.Object.Bits.Type] : GDT_TYPES_X64[this.Object.Bits.Type];
    }

    get Type() {
        // From 3.4.5
        // 0 -> System
        // 1 -> Code & Data
        if (this.IsValid() === false)
            return "Invalid";
        let TypeBits = this.Object.Bits ? this.Object.Bits.Type : this.Object.Type;
        if (TypeBits.bitwiseAnd(0b10000).compareTo(0b10000) != 0)
            return "System";
        if (TypeBits.bitwiseAnd(0b11000).compareTo(0b11000) == 0)
            return "Code";
        return "Data";
    }

    get Base() {
        if (IsX64()) {
            // https://www.vergiliusproject.com/kernels/x64/Windows%2010%20%7C%202016/2110%2021H2%20(November%202021%20Update)/_KGDTENTRY64
            let High = this.Object.Bytes.BaseHigh.bitwiseShiftLeft(24);
            let Middle = this.Object.Bytes.BaseMiddle.bitwiseShiftLeft(16);
            let Low = this.Object.BaseLow;
            let Base = this.Object.BaseUpper.bitwiseShiftLeft(32);
            return Base.bitwiseOr(High).bitwiseOr(Middle).bitwiseOr(Low);
        } else {
            // https://www.vergiliusproject.com/kernels/x86/Windows%2010/2110%2021H2%20(November%202021%20Update)/_KGDTENTRY
            let High = this.Object.HighWord.Bytes.BaseHi.bitwiseShiftLeft(24);
            let Middle = this.Object.HighWord.Bytes.BaseMid.bitwiseShiftLeft(16);
            let Low = this.Object.BaseLow;
            return High.bitwiseOr(Middle).bitwiseOr(Low);
        }
    }

    IsPresent() {
        let PresentBit = this.Object.Bits ? this.Object.Bits.Present : this.Object.Present;
        return PresentBit === 1;
    }

    IsValid() {
        let TypeBits = this.Object.Bits ? this.Object.Bits.Type : this.Object.Type;
        return this.IsPresent() || TypeBits !== 0;
    }
}

class GdtEntry extends EntryGeneric {

    constructor(core, register, index) {
        super(core, register, index);
        let __type = IsX64() ? "_KGDTENTRY64*" : "_KGDTENTRY*";
        this.__Address = this.__Register.add(this.__Index.multiply(8));
        this.__Object = host.createPointerObject(this.__Address, "nt", __type);
        this.__typeName = "GdtEntry";

        // if it's a Task Segment Selector type, add the native object
        if (this.Object.Bits.Type.bitwiseAnd(0b01011).compareTo(0b01011) == 0) {
            let __type2 = IsX64() ? "_KTSS64*" : "_KTSS*";
            this.Tss = host.createPointerObject(this.Base, "nt", __type2);
        }
    }

    toString() {
        return `${this.Name}(@${this.Address.toString(16)}, CoreIndex=${this.CoreIndex}, Type=${this.Type}, Description="${this.Description}")`;
    }

    IsConforming() {
        const bHasCodeFlag = 0b0100;
        const bHasConformingFlag = bHasCodeFlag & 0b1000;
        return (this.Object.Bits.Type.bitwiseAnd(bHasConformingFlag) === bHasConformingFlag);
    }
}


class IdtEntry extends EntryGeneric {

    constructor(core, register, index) {
        super(core, register, index);

        let __type = IsX64() ? "_KIDTENTRY64 *" : "_KIDTENTRY *";
        this.__Address = this.__Register.add(this.__Index.multiply(16));
        this.__Object = host.createPointerObject(this.__Address, "nt", __type);
        this.__typeName = "IdtEntry";

        // if it's a Interrupt Gate type, add the function it points to
        assert(this.Object.Type.bitwiseAnd(0b01110).compareTo(0b01110) == 0);

        this.GateAddress = this.Object.OffsetHigh.bitwiseShiftLeft(32).bitwiseOr(
            this.Object.OffsetMiddle.bitwiseShiftLeft(16).bitwiseOr(this.Object.OffsetLow)
        );
    }

    toString() {
        return `${this.Name}(@${this.__Address.toString(16)}, CoreIndex=${this.CoreIndex}, Type=${this.Type}, Symbol="${this.Symbol}")`;
    }

    get Symbol() {
        return GetSymbolFromAddress(this.GateAddress);
    }
}


class RegisterGeneric {
    constructor(CoreIndex, cls) {
        this.__CoreIndex = CoreIndex;
        this.__MaxGdtSize = 65536;
        this.__MaxGdtEntries = this.__MaxGdtSize / 8;
        this.__cls = cls;

        // Below must be defined
        this.__register = null;
        this.__registerl = null;
    }

    get CoreIndex() {
        return this.__CoreIndex;
    }

    get Register() {
        return this.__register;
    }

    get Size() {
        return this.__registerl.multiply(8);
    }

    get Entries() {
        return this.__registerl;
    }

    toString() {
        throw new Error("Can't instantiate abstract class!");
    }

    *[Symbol.iterator]() {
        for (let i = 0; i < this.Entries; i++) {
            let entry = new this.__cls(this.CoreIndex, this.Register, i);
            if (entry.IsValid())
                yield new host.indexedValue(entry, [i]);
        }
    }

    getDimensionality() {
        return 1;
    }

    getValueAt(index) {
        assert(index < this.Entries);
        return new this.__cls(this.__CoreIndex, this.Register, index);
    }
}


/**
 * A GDT object
 * The instance is an iterable, whose key is the index of a valid entry, the value the GDT entry associated to this index
 */
class Gdt extends RegisterGeneric {
    constructor(CoreIndex) {
        super(CoreIndex, GdtEntry);
        this.__register = $("gdtr");
        this.__registerl = $("gdtl");
        assert(this.__registerl < this.__MaxGdtEntries);
    }

    toString() {
        return `Gdt(gdtr=@${this.Register.toString(16)}, Core=${this.CoreIndex})`;
    }
}


class Idt extends RegisterGeneric {
    constructor(CoreIndex) {
        super(CoreIndex, IdtEntry);
        this.__register = $("idtr");
        this.__registerl = $("idtl");
        assert(this.__registerl < this.__MaxGdtEntries);
    }

    toString() {
        return `Idt(idtr=@${this.Register.toString(16)}, Core=${this.CoreIndex})`;
    }
}



class GenericIterator {
    constructor() {
        this.__NumberOfProcessors = u32(host.getModuleSymbolAddress("nt", "KeNumberProcessors"));
        this.__entryType = null;
    }

    get NumberOfProcessors() {
        return this.__NumberOfProcessors;
    }

    *[Symbol.iterator]() {
        for (let i = 0; i < this.__NumberOfProcessors; i++) {
            this.SetCurrentProcessor(i);
            yield new host.indexedValue(new this.__entryType(i), [i]);
        }
    }

    toString() {
        throw new Error("Can't instantiate abstract class!");

    }

    getDimensionality() {
        return 1;
    }

    getValueAt(core) {
        assert(core < this.__NumberOfProcessors);
        assert(this.__entryType !== null);
        this.SetCurrentProcessor(core);
        return new this.__entryType(core);
    }

    SetCurrentProcessor(Index) {
        system(`~${Index}s`);
    }
}


/**
 * Iterate through all GDTs.
 * The instance is an iterable, whose key is the processor number, the value the GDT associated to the processor
 */
class GdtIterator extends GenericIterator {
    constructor() {
        super();
        this.__entryType = Gdt;
    }

    toString() {
        return `GdtIterator(NumProc=${this.NumberOfProcessors})`
    }
}


class IdtIterator extends GenericIterator {
    constructor() {
        super();
        this.__entryType = Idt;
    }

    toString() {
        return `IdtIterator(NumProc=${this.NumberOfProcessors})`
    }
}


function* GdtAccessHelper(Index) {
    if (!IsKd() || !IsX64()) {
        err("Must run in Kd x64");
        return;
    }

    let it = new GdtIterator();
    if (Index === undefined) {
        for (const item of it) {
            yield item;
        }
    }

    return it[Index];
}


function* IdtAccessHelper(Index) {
    if (!IsKd() || !IsX64()) {
        err("Must run in Kd x64");
        return;
    }

    let it = new IdtIterator();
    if (Index === undefined) {
        for (const item of it) {
            yield item;
        }
    }

    yield it[Index];
}


/**
 * Declare the extension as part of the DDM, under Thread model
 */
class GdtExtension {
    get GlobalDescriptorTable() {
        return new GdtIterator();
    }

    get InterruptDescriptorTable() {
        return new IdtIterator();
    }
}


/**
 * Dump the IDT/GDT for all cores
 */
function invokeScript(type) {
    if (type === "idt") {
        return new IdtIterator();
    }
    else {
        return new GdtIterator();
    }
}


/*
 *
 */
function initializeScript() {
    ok("Creating the variables `GlobalDescriptorTable` and `InterruptDescriptorTable` to each thread...");

    return [
        new host.apiVersionSupport(1, 3),
        new host.namedModelParent(GdtExtension, "Debugger.Models.Thread"),

        new host.functionAlias(GdtAccessHelper, "Gdt"),
        new host.functionAlias(IdtAccessHelper, "Idt"),
    ];

}
