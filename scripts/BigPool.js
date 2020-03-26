/// <reference path="../extra/JSProvider.d.ts" />
"use strict";


/**
 * Browse through Big Pool chunks easily
 *
 * Usage:
 * kd> .scriptload z:\windbg_js_scripts\bigpool.js
 * kd> dx @$BigPool().Where( p => p.Tag == "ThNm" )
 */

const log = x => host.diagnostics.debugLog(`${x}\n`);
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const sizeof = x => host.evaluateExpression(`sizeof(${x})`);
const u32 = x => host.memory.readMemoryValues(x, 1, 4)[0];
const u64 = x => host.memory.readMemoryValues(x, 1, 8)[0];

function open(x) { return host.namespace.Debugger.Utility.FileSystem.OpenFile(x); }
function readlines(x) { return host.namespace.Debugger.Utility.FileSystem.CreateTextReader(x).ReadLineContents(); }
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }


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
    for (var i = 0; (i < hex.length && hex.substr(i, 2) !== '00'); i += 2) str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str.split("").reverse().join("");
}



const POOLTAG_FILEPATH = "\\\\ph0ny\\code\\windbg_js_scripts\\extra\\pooltag.txt";
var g_PoolTag_Content = [];


/**
 * Returns the tag info corresponding to the given tag name
 */
function GetTagInfo(TagName)
{
    for(let entry of g_PoolTag_Content)
    {
        if(entry[0] === TagName)
            return entry;
    }

    return undefined;
}



/**
 * Refresh the tag info cache
 */
function RefreshPooltagCache()
{
    log(`caching content of ${POOLTAG_FILEPATH}, this might take a bit...`);
    let res = false;
    let file = open(POOLTAG_FILEPATH);
    try
    {
        for(let line of readlines(file))
        {
            if (line === undefined || line.length === 0)
                continue;

            let trimmed = line.trim();

            // skip empty trimmed lines
            if (trimmed.length === 0)
                continue;

            // skip comments
            if (trimmed.toLowerCase().startsWith("rem") || trimmed.startsWith("//"))
                continue;

            // split parts
            let parts = trimmed.split(" - ", 3);
            let _tag =  parts[0] != undefined ? parts[0].trim() : "";
            let _file = parts[1] != undefined ? parts[1].trim() : "";
            let _desc = parts[2] != undefined ? parts[2].trim() : "";
            if (_tag.length === 0)
                continue;

            g_PoolTag_Content.push( [_tag, _file, _desc] );
        }
        res = true;
        log(`done`);
    }
    catch(e)
    {
        log(`exception ${e}`);
    }
    finally
    {
        file.Close();
    }
    return res;
}



/**
 *
 */
class BigPool
{
    /**
     *
     */
    constructor(obj)
    {
        this.__RawObject = obj;
        this.__VirtualAddress = obj.Va;
        this.__Tag = obj.Key;
        this.__Size = obj.NumberOfBytes;
        this.__Type = obj.PoolType;

        // tag info
        let __tagstr = Hex2Ascii(this.__Tag);
        let __info = GetTagInfo(__tagstr);
        if (__info != undefined)
            this.TagInfo = {
                Name: __tagstr,
                BinaryName: __info[1],
                Description: __info[2]
            }
        else
            this.TagInfo = {
                Name: __tagstr,
                BinaryName: "",
                Description: ""
            }
    }


    /**
     *
     */
    get VirtualAddress()
    {
        return this.__VirtualAddress.bitwiseShiftRight(1).bitwiseShiftLeft(1);
    }


    /**
     *
     */
    get Size()
    {
        return this.__Size;
    }


    /**
     *
     */
    get Type()
    {
        let _type = this.__Type;
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
        let txt = `'${this.TagInfo.Name}'`;
        if(this.TagInfo.BinaryName !== "" || this.TagInfo.Description !== "")
            txt += ` (${this.TagInfo.BinaryName} - ${this.TagInfo.Description})`
        return txt;
    }


    /**
     *
     */
    get IsFreed()
    {
        return this.__VirtualAddress.bitwiseAnd(1) === 0;
    }


    /**
     *
     */
    toString()
    {
        return `BigPool(VA=${this.VirtualAddress.toString(16)}, Tag=${this.Tag}, Size=${this.Size}, Type=${this.Type})`;
    }
}


/**
 *
 */
class BigPoolList
{
    /**
     *
     */
    constructor()
    {
        this.PoolBigPageTablePointer = host.createPointerObject(
            host.getModuleSymbolAddress("nt", "PoolBigPageTable"),
            "nt",
            "_POOL_TRACKER_BIG_PAGES**"
        );
        this.PoolBigPageTable = this.PoolBigPageTablePointer.dereference();
        this.PoolBigPageTableSize = u32( host.getModuleSymbolAddress("nt", "PoolBigPageTableSize") );
        this.SizeOfPoolTracker = sizeof("_POOL_TRACKER_BIG_PAGES");
        this.NumberOfEntries =  Math.floor(this.PoolBigPageTableSize / this.SizeOfPoolTracker);
    }

    /**
     *
     */
    *[Symbol.iterator]()
    {
        if (IsKd())
        {
            for(let i = 0; i < this.NumberOfEntries ; i++)
            {
                if (this.PoolBigPageTable[i].Va.compareTo(1) == 1)
                {
                    let pool = new BigPool(this.PoolBigPageTable[i] );
                    yield pool;
                }
            }
        }
    }

}


/**
 *
 */
function BigPoolIterator()
{
    if ( g_PoolTag_Content === undefined || g_PoolTag_Content.length === 0)
        RefreshPooltagCache();

    return new BigPoolList();
}


/**
 *
 */
function initializeScript()
{
    let CommandName = "BigPool";
    log(`[+] Adding function '${CommandName}'`);

    return [
        new host.functionAlias(BigPoolIterator, CommandName),
        new host.apiVersionSupport(1, 3),
    ];
}

