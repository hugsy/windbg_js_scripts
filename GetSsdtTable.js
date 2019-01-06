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
"use strict";

const log = x => host.diagnostics.debugLog(x + "\n");
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const Dereference = addr => host.evaluateExpression("(unsigned int*)0x" + addr.toString(16)).dereference();

function IsX64(){return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize == 8;}
function GetSymbolFromAddress(x){ return system('.printf "%y", ' + x.toString(16)).First(); }


class SsdtEntry
{
    constructor(addr, name)
    {
        this.Address = addr
        this.Name = name;
    }

    toString()
    {
        return `(${this.Address.toString(16)}) ${this.Name}`;
    }
}


/**
 * Retrieve the SSDT offsets from nt!KeServiceDescriptorTable
 */
function FetchSsdtOffsets()
{
    var SsdtTable = host.getModuleSymbolAddress("nt", "KeServiceDescriptorTable");
    var NumberOfSyscalls = Dereference( host.getModuleSymbolAddress("nt", "KiServiceLimit") );
    var SsdtOffsetTable = [];
    var expr = "**(unsigned int(**)[" + NumberOfSyscalls.toString() + "])0x" + SsdtTable.toString(16);
    SsdtOffsetTable["Offsets"] = host.evaluateExpression(expr);
    SsdtOffsetTable["Base"] = host.getModuleSymbolAddress("nt", "KiServiceTable");
    return SsdtOffsetTable;
}


/**
 * Build a generator function from the SSDT table offsets, that returns the symbol
 * associated to the address.
 */
function *ShowSsdtTable()
{
    let OffsetTable = FetchSsdtOffsets();
    for (var i = 0 ; i < OffsetTable.Offsets.Count(); i++)
    {
        var Address;

        if (IsX64())
        {
            Address = OffsetTable.Base.add(OffsetTable.Offsets[i] >> 4);
        }
        else
        {
            Address = OffsetTable.Base.add(OffsetTable.Offsets[i]);
        }
        var Symbol = GetSymbolFromAddress(Address);
        yield new SsdtEntry(Address, Symbol) ;
    }
}


function initializeScript()
{
    //
    // Alias the function to WinDBG
    //
    log("[+] Creating the variable `ServiceTable` for the SSDT...");
    return [new host.functionAlias(ShowSsdtTable, "ServiceTable")];
}
