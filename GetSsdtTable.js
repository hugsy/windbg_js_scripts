/**
 *
 * Get the SSDT (nt) as WinDBG convience array
 *
 * Note: this script is done for x64 versions of Windows (no need on x32)
 *
 * Use as:
 * kd> .scriptload \path\to\GetSsdtTable.js
 * kd> dx @$ServiceTable().Where( s => s.Name.Contains("nt") ).Count()
 */
"use strict";

const log = x => host.diagnostics.debugLog(x + "\n");

class SsdtEntry
{
    constructor(addr, name)
    {
        this.Address = addr
        this.Name = name;
    }

    toString()
    {
        return "(" + this.Address.toString(16) + ") " + this.Name;
    }
}


/**
 * Run a native WinDBG command and get the result as a string
 */
function ExecuteCommand(cmd)
{
    return host.namespace.Debugger.Utility.Control.ExecuteCommand(cmd);
}


/**
 * Dereference an integer pointer
 */
function Dereference(addr)
{
    return host.evaluateExpression("(unsigned int*)0x" + addr.toString(16)).dereference();
}


/**
 * Retrieve a symbol from an address
 *
 * Note: AFAIK there is no native way to do so, it's a bit hackish but works
 */
function GetSymbolFromAddress(addr)
{
    var res = ExecuteCommand('.printf "%y", ' + addr.toString(16)).First();
    return res;
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
        var Address = OffsetTable.Base.add(OffsetTable.Offsets[i] >> 4);
        var Symbol = GetSymbolFromAddress(Address);
        yield new SsdtEntry(Address, Symbol) ;
    }
}


function initializeScript()
{
    //
    // Alias the function to WinDBG
    //
    return [new host.functionAlias(ShowSsdtTable, "ServiceTable")];
}
