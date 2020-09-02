/// <reference path="JSProvider.d.ts" />
"use strict";

/**
 *
 * Explore the registry hives
 *
 */


const log  = x => host.diagnostics.debugLog(`${x}\n`);
const ok   = x => log(`[+] ${x}`);
const warn = x => log(`[!] ${x}`);
const err  = x => log(`[-] ${x}`);
const hex  = x => x.toString(16);
const i64  = x => host.parseInt64(x);
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const sizeof = x => i64(system(`?? sizeof(${x})`)[0].split(" ")[2]);
const  u8 = x => host.memory.readMemoryValues(x, 1, 1)[0];
const u16 = x => host.memory.readMemoryValues(x, 1, 2)[0];
const u32 = x => host.memory.readMemoryValues(x, 1, 4)[0];
const u64 = x => host.memory.readMemoryValues(x, 1, 8)[0];
const FIELD_OFFSET = (t, n) => parseInt( system(`?? #FIELD_OFFSET(${t}, ${n})`).First().split(" ")[1].replace("0n", "") );
//const CONTAINING_RECORD = (a, t, n) => a.substract(FIELD_OFFSET(t, n)); // todo: wtf: Int64().substract() -> "Object doesn't support property or method 'substract' "
const CONTAINING_RECORD = (a, t, n) => a.add(-FIELD_OFFSET(t, n));

function ptrsize(){ return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize; }
function pagesize(){ return host.namespace.Debugger.State.PseudoRegisters.General.pagesize; }
function IsX64(){ return ptrsize() === 8;}
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }
function $(r){ return IsKd() ? host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.User[r] || host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.Kernel[r] : host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.User[r]; }
function GetSymbolFromAddress(x){ return system(`.printf "%y", ${x.toString(16)}`).First(); }
function poi(x){ return IsX64() ? u64(x) : u32(x); }


class HiveObject
{
    /**
     * Create a new hive object
     */
    constructor(obj)
    {
    }
}


class HiveExplorer //extends HiveNode
{
    /**
     *
     */
    constructor()
    {
        //
        // The hives are linked via nt!CmpHiveListHead
        //
        this.Name = "root";
        this.Address = poi(host.getModuleSymbolAddress("nt", "CmpHiveListHead"));
    }


    /**
     *
     */
    get Children()
    {
        return this.__WalkChildren();
    }



    /**
     * Visit children nodes
     */
    *__WalkChildren()
    {
        let addr = CONTAINING_RECORD(this.Address, "nt!_CMHIVE", "HiveList" );

        // First entry
        let pHiveEntry = host.createPointerObject(addr, "nt", "_CMHIVE*");

        // Create the iterator
        let HiveIterator = host.namespace.Debugger.Utility.Collections.FromListEntry(
            pHiveEntry.HiveList,
            "nt!_CMHIVE",
            "HiveList"
        );

        for (let hive of HiveIterator)
        {
            yield hive;
        }
    }


    /**
     * Help
     */
    get [Symbol.metadataDescriptor]()
    {
        return {
            Parent: { Help: "Pointer to the parent node.", },
            Name: { Help: "Name of the current node.", },
            Children: { Help: "Enumerate all the children to this node.", }
        };
    }
}


class SessionModelParent
{
    /**
     * Help
     */
    get [Symbol.metadataDescriptor]()
    {
        return {
            RegistryHives: { Help: "Explore all the registry hives.", },
        };
    }

    /**
     * Root object getter
     */
    get RegistryHives()
    {
        return new HiveExplorer();
    }
}


/**
 *
 */
function initializeScript()
{
    ok("Extending session model with `@$cursession.Registry`...");

    return [
        new host.namedModelParent(
            SessionModelParent,
            'Debugger.Models.Session'
        ),
        new host.apiVersionSupport(1, 3)
    ];
}

