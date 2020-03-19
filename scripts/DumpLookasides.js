/// <reference path="../extra/JSProvider.d.ts" />
/// @ts-check
"use strict";


/**
 *
 * Recurse through lookaside lists from nt
 *
 * Syntax:
 * > dx @$LookAsides(<LL>)
 *
 * Where: LL can be "all", or one of: "pool", "system", "npgeneral", "pgeneral"
 *
 * Example:
 * kd> dx @$LookAsides("pool")
 * will parse the Non-Paged and Paged Pool lookaside list
 */

const log  = x => host.diagnostics.debugLog(`${x}\n`);
const ok   = x => log(`[+] ${x}`);
const warn = x => log(`[!] ${x}`);
const err  = x => log(`[-] ${x}`);
const hex  = x => x.toString(16);
const i64  = x => host.parseInt64(x);
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const sizeof = x => host.evaluateExpression(`sizeof(${x})`);
const  u8 = x => host.memory.readMemoryValues(x, 1, 1)[0];
const u16 = x => host.memory.readMemoryValues(x, 1, 2)[0];
const u32 = x => host.memory.readMemoryValues(x, 1, 4)[0];
const u64 = x => host.memory.readMemoryValues(x, 1, 8)[0];

function ptrsize(){ return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize; }
function IsX64(){ return ptrsize() === 8;}
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }
function $(r){ if(!IsKd()) return host.currentThread.Registers.User[r]; else return host.namespace.Debugger.State.DebuggerVariables.curprocess.Threads.First().Registers.User[r] || host.namespace.Debugger.State.DebuggerVariables.curprocess.Threads.First().Registers.Kernel[r]; }
function GetSymbolFromAddress(x){ return system(`.printf "%y", ${x.toString(16)}`).First(); }
function poi(x){ return IsX64() ? u64(x) : u32(x); }

//
// copied from BigPool.js
//
const _POOL_TYPES = {
    0 : "NonPagedPool",
    // NonPagedPoolExecute = 0
    1 : "PagedPool",
    2 : "NonPagedPoolMustSucceed",
    3 : "DontUseThisType",
    4 : "NonPagedPoolCacheAligned",
    5 : "PagedPoolCacheAligned",
    6 : "NonPagedPoolCacheAlignedMustS",
    7 : "MaxPoolType",
    //NonPagedPoolBase = 0
    //NonPagedPoolBaseMustSucceed = 2
    //NonPagedPoolBaseCacheAligned = 4
    //NonPagedPoolBaseCacheAlignedMustS = 6
    32 : "NonPagedPoolSession",
    33 : "PagedPoolSession",
    34 : "NonPagedPoolMustSucceedSession",
    35 : "DontUseThisTypeSession",
    36 : "NonPagedPoolCacheAlignedSession",
    37 : "PagedPoolCacheAlignedSession",
    38 : "NonPagedPoolCacheAlignedMustSSession",
    512: "NonPagedPoolNx",
    516: "NonPagedPoolNxCacheAligned",
    544: "NonPagedPoolSessionNx",
};


function PoolTypeAsBitmaskString(val)
{
    let res = [];
    for( let _type in _POOL_TYPES )
    {
        if( _type == val )
            res.push(_POOL_TYPES[_type]);
        else if( _type != 0 && (val & _type) == _type)
            res.push(_POOL_TYPES[_type]);
    }
    if (res.length == 0)
        return null;
    return res.join("|");
}


function Hex2Ascii(hexx)
{
    var hex = hexx.toString(16);
    var str = '';
    for (var i = 0; (i < hex.length && hex.substr(i, 2) !== '00'); i += 2)
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str.split("").reverse().join("");
}


/**
 *
 */
class LookasideItem
{
    constructor(obj, name)
    {
        this.RawObject = obj;
        this.Name = `${name}LookasideItem`;
        this.Address = this.RawObject.address;
    }


    /**
     *
     */
    get Size()
    {
        return this.RawObject.Size;
    }


    /**
     *
     */
    get Type()
    {
        let _type = this.RawObject.Type;
        let _res = PoolTypeAsBitmaskString(_type);
        if( _res  === null )
            return _type.toString(16);
        return _res;
    }


    /**
     *
     */
    get Tag()
    {
        let _tag = this.RawObject.Tag;
        return Hex2Ascii(_tag);
    }


    /**
     *
     */
    toString()
    {
        return `${this.Name}(Type=${this.Type}, Size=${this.Size}, Tag="${this.Tag}" (0x${this.RawObject.Tag.toString(16)}))`;
    }
}


/**
 *
 */
class LookasideList
{
    constructor(symbol, name)
    {
        let parts = symbol.split("!");
        this.__module = parts[0];
        this.__symbol = parts[1];
        this.__item_processed = 0;
        this.__name = name[0].toUpperCase() + name.toLowerCase().slice(1);
    }


    *[Symbol.iterator]()
    {
        if (IsKd())
        {
            let LookAsideListHead = host.createPointerObject(
                host.getModuleSymbolAddress(this.__module, this.__symbol),
                "nt",
                "_LIST_ENTRY*"
            );

            let LookAsideHead = host.createPointerObject(
                LookAsideListHead.address,
                "nt",
                "_GENERAL_LOOKASIDE*"
            );

            let LookAsideIterator = host.namespace.Debugger.Utility.Collections.FromListEntry(
                LookAsideHead.ListEntry,
                "nt!_GENERAL_LOOKASIDE",
                "ListEntry"
            );


            for( let item of LookAsideIterator)
            {
                yield new LookasideItem(item, this.__name);
                this.__item_processed += 1;
            }
        }
    }
}



/**
 *
 */
function *GetAllLookAsideIterator(arg)
{
    // nt!ExPoolLookasideListHead    ->   Non-Paged and Paged Pool lookaside list
    // nt!ExSystemLookasideListHead  ->   Non-Paged and Paged System lookaside list
    // nt!ExNPagedLookasideListHead  ->   Non-Paged General lookaside list
    // nt!ExPagedLookasideListHead   ->   Paged General lookaside list

    const _nt_ll_list = [
        "nt!ExPoolLookasideListHead",
        "nt!ExSystemLookasideListHead",
        "nt!ExNPagedLookasideListHead",
        "nt!ExPagedLookasideListHead"
    ];

    let lists = [];
    if(arg === "all")
        lists = _nt_ll_list;
    else if (arg === "pool")
        lists.push("nt!ExPoolLookasideListHead");
    else if (arg === "system")
        lists.push("nt!ExSystemLookasideListHead");
    else if (arg === "npgeneral")
        lists.push("nt!ExNPagedLookasideListHead");
    else if (arg === "pgeneral")
        lists.push("nt!ExPagedLookasideListHead");

    for(let list of lists)
    {
        for (let p of new LookasideList(list, arg))
        {
            yield p;
        }
    }
}



/**
 *
 */
function initializeScript()
{
    let CommandName = "LookAsides";
    log(`[+] Creating the variable '${CommandName}'...`);
    return [
        new host.apiVersionSupport(1, 3),
        new host.functionAlias(GetAllLookAsideIterator, CommandName),
    ];
}

