/**
 *
 * Get the Interrupt Descriptor Table as WinDBG convience array
 *
 *
 * Use as:
 * kd> .scriptload \path\to\GetInterruptDescriptorTable.js
 * kd> dx @$Idt().Count()
 * kd> dx @$Idt(0x2e).First()
 *
 */
"use strict";

const log = x => host.diagnostics.debugLog(x + "\n");
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget  === true; }
function IsX64(){return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize == 8;}
function $(r){ return host.namespace.Debugger.State.DebuggerVariables.curprocess.Threads.First().Registers.User[r] || host.namespace.Debugger.State.DebuggerVariables.curprocess.Threads.First().Registers.Kernel[r]; }
function GetSymbolFromAddress(x){ return system('.printf "%y", ' + x.toString(16)).First(); }


/**
 * JS version of Interrupt Gate (Intel Manual Volume 3A, 6-11)
 */
class InterruptGate
{
    constructor(addr, sym, type, dpl, present, selector)
    {
        this.Address = addr // linear address
        this.Symbol = sym; //symbol if any
        this.Type = type;
        this.Dpl = dpl;
        this.Present = present;
        this.Selector = selector;
    }

    toString()
    {
        return this.Symbol;
    }
}


/**
 *
 */
function FetchIdtGate(Index)
{
    var Idtr = $("idtr");
    var Off = Idtr.add(Index * 16);
    var IdtEntry = host.createPointerObject(Off, "nt", "_KIDTENTRY64 *");
    var GateAddress = IdtEntry.OffsetHigh.bitwiseShiftLeft(32).bitwiseOr(
        IdtEntry.OffsetMiddle.bitwiseShiftLeft(16).bitwiseOr(IdtEntry.OffsetLow)
    );
    var Gate = new InterruptGate(
        GateAddress,
        GetSymbolFromAddress(GateAddress),
        IdtEntry.Type,
        IdtEntry.Dpl,
        IdtEntry.Present == 1,
        IdtEntry.Selector
        );
    return Gate;
}


/**
 *
 */
function *ShowIdtTable(Index)
{
    if (!IsKd() || !IsX64())
    {
        log("Must run in Kd x64");
        return;
    }

    if(Index !== undefined)
    {
        yield FetchIdtGate(Index);
    }
    else
    {
        for (var i = 0 ; i < 0x100; i++)
        {
            yield FetchIdtGate(i);
        }
    }
}


/**
 *
 */
function initializeScript()
{
    log("[+] Creating the variable `Idt` for the SSDT...");
    return [
        new host.functionAlias(ShowIdtTable, "Idt")
    ];
}
