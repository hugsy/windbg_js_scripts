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
const u32 = x => host.memory.readMemoryValues(x, 1, 4)[0];

function IsX64(){return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize == 8;}
function GetSymbolFromAddress(x){ return system('.printf "%y", ' + x.toString(16)).First(); }


class SsdtEntry
{
    constructor(addr, name, argnum)
    {
        this.Address = addr
        this.Name = name;
        this.NumberOfArgumentsOnStack = argnum;
    }


    toString()
    {
        let str = `(${this.Address.toString(16)}) ${this.Name}`;
        if (IsX64() && this.NumberOfArgumentsOnStack)
            str += ` StackArgNum=${this.NumberOfArgumentsOnStack}`;
        return str;
    }
}


/**
 * Retrieve the SSDT offsets from nt!KeServiceDescriptorTable
 */
function FetchSsdtOffsets()
{
    var SsdtOffsetTable = [];
    if(IsX64())
    {
        let SsdtTable = host.getModuleSymbolAddress("nt", "KeServiceDescriptorTable");
        let NumberOfSyscalls = u32( host.getModuleSymbolAddress("nt", "KiServiceLimit") );
        let expr = "**(unsigned int(**)[" + NumberOfSyscalls.toString() + "])0x" + SsdtTable.toString(16);
        SsdtOffsetTable["Offsets"] = host.evaluateExpression(expr);
        SsdtOffsetTable["Base"] = host.getModuleSymbolAddress("nt", "KiServiceTable");
    }
    else
    {
        let SsdtTable = host.getModuleSymbolAddress("nt", "_KeServiceDescriptorTable");
        let NumberOfSyscalls = u32( host.getModuleSymbolAddress("nt", "_KiServiceLimit") );
        let expr = "**(unsigned int(**)[" + NumberOfSyscalls.toString() + "])0x" + SsdtTable.toString(16);
        SsdtOffsetTable["Offsets"] = host.evaluateExpression(expr);
        SsdtOffsetTable["Base"] = host.getModuleSymbolAddress("nt", "_KiServiceTable");        
    }
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
        let Address, ArgNum = 0;

        if (IsX64())
        {
            Address = OffsetTable.Base.add(OffsetTable.Offsets[i] >> 4);
            ArgNum = OffsetTable.Offsets[i] & 3;
        }
        else
        {
            Address = OffsetTable.Offsets[i];
        }

        var Symbol = GetSymbolFromAddress(Address);
        yield new SsdtEntry(Address, Symbol, ArgNum);
    }
}


function initializeScript()
{
    //
    // Alias the function to WinDBG
    //
    log("[+] Creating the variable `ssdt` for the SSDT...");
    return [
        new host.apiVersionSupport(1, 3),

        new host.functionAlias(
            ShowSsdtTable,
            "ssdt"
        ),
    ];
}
