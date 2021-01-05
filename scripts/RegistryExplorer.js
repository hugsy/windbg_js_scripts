/// <reference path="../extra/JSProvider.d.ts" />
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
const sizeof = x => parseInt((system(`?? sizeof(${x})`)[0].split(" ")[2]), 16);
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
function assert(condition) {if (!condition){throw new Error("Assertion failed"); }}
function hex_to_ascii(str1){var hex  = str1.toString();var str = '';for(var n = 0; n < hex.length; n += 2) str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));return str;}


/**
 * Those constants and functions are from ReactOS & SwishDbgExt
 * - https://doxygen.reactos.org/dc/dea/hivedata_8h.html
 * - https://doxygen.reactos.org/d0/d77/winreg_8h.html
 * - https://github.com/comaeio/SwishDbgExt/blob/master/SwishDbgExt/Registry.h
 */

const REG_NONE = 0;
const REG_SZ = 1;
const REG_EXPAND_SZ = 2;
const REG_BINARY = 3;
const REG_DWORD_LITTLE_ENDIAN = 4;
const REG_DWORD = 4;
const REG_DWORD_BIG_ENDIAN = 5;
const REG_LINK = 6;
const REG_MULTI_SZ = 7;
const REG_RESOURCE_LIST = 8;
const REG_FULL_RESOURCE_DESCRIPTOR = 9;
const REG_RESOURCE_REQUIREMENTS_LIST = 10;
const REG_QWORD_LITTLE_ENDIAN = 11;
const REG_QWORD = 11;

const CM_KEY_BODY_TYPE        = 0x6B793032; // 0x6B793032 -> 'ky02'

const CM_KEY_NODE_SIGNATURE   = 0x6b6e;   // "kn" -> nt!_CM_KEY_NODE
const CM_LINK_NODE_SIGNATURE  = 0x6b6c;   // "kl" -> (refer.) ChildHiveReference.KeyHive
const CM_KEY_VALUE_SIGNATURE  = 0x6b76;   // "kv" -> nt!_CM_KEY_VALUE
const CM_FAST_LEAF_SIGNATURE  = 0x666c;   // "fl" -> nt!_CM_KEY_INDEX
const CM_HASH_LEAF_SIGNATURE  = 0x686c;   // "hl"
const CM_INDEX_ROOT_SIGNATURE = 0x6972;   // "ir"
const CM_INDEX_LEAF_SIGNATURE = 0x696c;   // "il"

const CM_BIN_SIGNATURE        = 0x6e696268;
const CM_HIVE_SIGNATURE       = 0xbee0bee0;

const HCELL_TYPE_SHIFT = 31 ;
const HCELL_TYPE_MASK = 0x80000000;
const HCELL_TABLE_SHIFT = 21 ;
const HCELL_TABLE_MASK = 0x7fe00000;
const HCELL_BLOCK_SHIFT = 12;
const HCELL_BLOCK_MASK = 0x001ff000;
const HCELL_OFFSET_SHIFT = 0;
const HCELL_OFFSET_MASK = 0x00000fff;

const GetCellType = x => (x & HCELL_TYPE_MASK) >> HCELL_TYPE_SHIFT;
const GetCellTable = x => (x & HCELL_TABLE_MASK) >> HCELL_TABLE_SHIFT;
const GetCellBlock = x => (x & HCELL_BLOCK_MASK) >> HCELL_BLOCK_SHIFT;
const GetCellOffset = x => x & HCELL_OFFSET_MASK;


/**
 * Cached globals
 */
var g_RegistryRoot = undefined;
var g_RegistryExplorer = undefined;


function GetCellAddress(KeyHive, Index)
{
    let Type = GetCellType(Index);
    let Table = GetCellTable(Index);
    let Block = GetCellBlock(Index);
    let Offset = GetCellOffset(Index);
    log(`GetCellAddress: version=${KeyHive.Version} hhive=${KeyHive.address.toString(16)} type=${Type} table=${Table} block=${Block} offset=${Offset}`);

    let Map = KeyHive.Storage[Type].Map; // nt!_HMAP_DIRECTORY
    let MapTableEntry = Map.Directory[Table]; // nt!_HMAP_TABLE -> nt!_HMAP_ENTRY
    //log(`MapTableEntry=${hex(MapTableEntry.address)}`);
    let Entry = host.createPointerObject(MapTableEntry.address.add(Block * sizeof("nt!_HMAP_ENTRY")), "nt", "_HMAP_ENTRY*");
    let bin_addr = Entry.PermanentBinAddress.bitwiseAnd(~0x0f);
    let Bin = host.createPointerObject(bin_addr, "nt", "_HBIN*");

    if (Bin.Signature != CM_BIN_SIGNATURE)
        throw Error(`invalid bin signature ${hex(Bin.Signature)} for bin at ${hex(Bin.address)}`);

    let Address = bin_addr.add(Offset).add(4); // i.e. sizeof(LONG)
    return Address;
}


class KeyNode
{
    constructor(Index, KeyHive = undefined)
    {
        if (g_RegistryRoot === undefined)
        {
            g_RegistryRoot = host.createPointerObject(
                poi(host.getModuleSymbolAddress("nt", "CmpRegistryRootObject")),
                "nt",
                "_CM_KEY_BODY*"
            );

            assert(g_RegistryRoot.Type == CM_KEY_BODY_TYPE);
        }

        if (KeyHive === undefined)
            this.KeyHive = g_RegistryRoot.KeyControlBlock.KeyHive;
        else
            this.KeyHive = KeyHive;

        this.Address = GetCellAddress(this.KeyHive, Index);
        //log(`node_address=${hex(this.Address)}`);

        this.__Type = u16(this.Address);

        switch (this.__Type)
        {
        case CM_KEY_NODE_SIGNATURE:
            this.KeyNodeObject = host.createPointerObject(this.Address, "nt", "_CM_KEY_NODE*");
            this.KeyName = host.memory.readString(this.KeyNodeObject.Name.address, this.KeyNodeObject.NameLength);
            break;

        case CM_KEY_VALUE_SIGNATURE:
            this.KeyValueObject  = host.createPointerObject(this.Address, "nt", "_CM_KEY_VALUE*");
            this.KeyName = host.memory.readString(this.KeyValueObject.Name.address, this.KeyValueObject.NameLength);
            break;

        case CM_FAST_LEAF_SIGNATURE:
        case CM_HASH_LEAF_SIGNATURE:
            this.KeyIndexObject  = host.createPointerObject(this.Address, "nt", "_CM_KEY_INDEX*");
            break;

        default:
            throw Error(`unknown key type ${hex(this.__Type)}`);
            //break;
        }
    }


    get Type()
    {
        switch( this.__Type )
        {
        case CM_KEY_NODE_SIGNATURE:   return `CM_KEY_NODE_SIGNATURE (${hex(this.__Type)})`;
        case CM_LINK_NODE_SIGNATURE:  return `CM_LINK_NODE_SIGNATURE (${hex(this.__Type)})`;
        case CM_KEY_VALUE_SIGNATURE:  return `CM_KEY_VALUE_SIGNATURE (${hex(this.__Type)})`;
        case CM_FAST_LEAF_SIGNATURE:  return `CM_FAST_LEAF_SIGNATURE (${hex(this.__Type)})`;
        default: return `type=${hex(this.__Type)}`;
        }
    }


    toString()
    {
        let msg = '';
        if (this.KeyName) msg+= `${this.KeyName}`;
        else msg+= `KeyNode(${hex(this.Address)}, ${this.Type})`;
        return msg;
    }


    get Subkeys()
    {
        return this.__WalkChildren();
    }


    *__WalkChildren()
    {
        if(this.__Type != CM_KEY_NODE_SIGNATURE)
            return;

        // for now, only storage -> i.e. [0] (volatile in index [1] of dual_table)
        // todo: do volatile too
        let Count = this.KeyNodeObject.SubKeyCounts[0];
        //log(`${this.KeyName} has ${Count} subkeys`);
        let CellIndex = this.KeyNodeObject.SubKeyLists[0];
        //log(CellIndex);
        let SubKeyNode = new KeyNode(CellIndex, this.KeyHive);
        //log(`subkey table = ${SubKeyNode.Address.toString(16)}`);
        let sz = sizeof("nt!_CM_KEY_INDEX");

        for(let i=0; i<Count; i++)
        {
            //let SubKeyEntryHeader = host.createPointerObject(
            //    SubKeyNode.Address.add(i * sz),
            //    "nt",
            //    "_CM_KEY_INDEX*"
            //);

            let SubKeyEntry = host.createPointerObject(
                SubKeyNode.Address.add(4).add(i * sizeof("nt!_CM_INDEX")),
                "nt",
                "_CM_INDEX*"
                );

            let SubKey = new KeyNode(SubKeyEntry.Cell, this.KeyHive);
            yield SubKey;
        }
    }

}



class Hive
{
    /**
     * A "Hive" is a collection of Bins
     */
    constructor(obj)
    {
        this.HiveObject = obj; // type = _CMHIVE
        this.HiveHandle = this.HiveObject.Hive; // type = _HHIVE
        assert(this.HiveHandle.Signature == CM_HIVE_SIGNATURE);
        this.HiveAddress = obj.address;
        let path = obj.HiveRootPath;
        this.Path = host.memory.readWideString(path.Buffer, path.Length/2);
        this.RootCellIndex = this.HiveHandle.BaseBlock.RootCell;
        this.__FileName = this.Path.split("\\").slice(-1)[0];
        this.__KeyNode = undefined;
    }


    get RootNode()
    {
        if (this.__KeyNode === undefined)
            this.__KeyNode = new KeyNode(this.RootCellIndex, this.HiveHandle);
        return this.__KeyNode;
    }


    toString()
    {
        return this.Path;
    }


    get BaseBlock()
    {
        return this.HiveHandle.BaseBlock;
    }


    get BackingFile()
    {
        try
        {
            return host.memory.readWideString(this.HiveObject.FileUserName.Buffer);
        } catch (e) {}

        return "";
    }


    get [Symbol.metadataDescriptor]()
    {
        return {
            Path: { Help: "The virtual full path of the hive." },
            HiveAddress: { Help: "Address of the _HHIVE object.", },
            HiveObject: { Help: "The CMHIVE object.", },
            BaseBlock: { Help: "Base block of the current hive.", },
            BackingFile: { Help: "Full path the file backing the hive (if any).", },
        };
    }
}


class RegistryExplorer
{
    /**
     * A "Registry" is a collection of Hives
     * All hives (nt!_CMHIVE) are linked via nt!CmpHiveListHead
     */
    constructor()
    {
        this.Address = poi(host.getModuleSymbolAddress("nt", "CmpHiveListHead"));
    }


    /**
     * Recurse through the hives
     */
    get Hives()
    {
        return this.__WalkChildren();
    }

    /**
     * Visit children nodes
     */
    *__WalkChildren()
    {
        let addr = CONTAINING_RECORD(this.Address, "nt!_CMHIVE", "HiveList");

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
            try
            {
                yield new Hive(hive);
            }
            catch(Exception)
            {
                break;
            }
        }
    }


    /**
     * Help
     */
    get [Symbol.metadataDescriptor]()
    {
        return {
            Hives: { Help: "Enumerate all the children to this node.", },
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
            Registry: { Help: "Explore the registry.", },
        };
    }

    /**
     * Root object getter
     */
    get Registry()
    {
        if (g_RegistryExplorer === undefined)
            g_RegistryExplorer = new RegistryExplorer();
        return g_RegistryExplorer;
    }
}


function test(addr_hive, index_node)
{
    let h = host.createPointerObject(i64(addr_hive), "nt", "_HHIVE*");
    log(h.Signature.toString(16));
    let i = i64(index_node);
    log(i.toString(16));
    var n = new KeyNode(i, h);
    return n;
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
        new host.apiVersionSupport(1, 3),

        new host.functionAlias(test, "jstest"),
    ];
}

