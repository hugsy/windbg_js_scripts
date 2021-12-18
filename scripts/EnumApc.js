///
/// <reference path="../extra/JSProvider.d.ts" />
///
/// @ts-check
///
"use strict";


/**
 *
 * Browse through the APC in the current KD session.
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
function ptrsize(){ return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize; }
function pagesize(){ return host.namespace.Debugger.State.PseudoRegisters.General.pagesize; }
function IsX64(){ return ptrsize() === 8;}
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }
function $(r){ return IsKd() ? host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.User[r] || host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.Kernel[r] : host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.User[r]; }



class ApcObject
{
    /**
     * Create a new ApcObject
     * See http://www.opening-windows.com/techart_windows_vista_apc_internals2.htm
     */
    constructor(Apc)
    {
        this.__RawObject = Apc;
        this.__Type = this.__RawObject.Type;
        this.__ApcStateIndex = this.__RawObject.ApcStateIndex;
        this.__Thread = this.__RawObject.Thread;
        this.__Process = this.__Thread.Process;
    }

    toString()
    {
        let text = `APC @ ${hex(this.__RawObject.address)} [${this.Name}]`;
        return text;
    }

    get RawObject()
    {
        return this.__RawObject;
    }

    get Process()
    {
        return this.__Process;
    }

    get Thread()
    {
        return this.__Thread;
    }

    get Name()
    {
        if (this.__RawObject.NormalRoutine === 0)
        {
            return "SPECIALKERNEL";
        }
        else
        {
            // i.e. NormalRoutine !== 0
            if (this.__RawObject.ApcMode === 1)
            {
                return "USER";
            }
            else (this.__RawObject.ApcMode === 0)
            {
                return "KERNEL";
            }
        }
        return "";
    }

    get Type()
    {
        return this.__Type;
    }

    get ApcStateIndex()
    {
        return this.__ApcStateIndex;
    }

    get [Symbol.metadataDescriptor]()
    {
       return {
           RawObject: { Help: "RawObject"},
           Process: { Help: "Process"},
           Thread: { Help: "Thread"},
           Type: { Help: "Type"},
           Name: { Help: "Name"},
           ApcStateIndex: { Help: "ApcStateIndex"},
       };
    }
}


class ApcIterator
{
    getDimensionality()
    {
        return 1;
    }

    getValueAt(idx)
    {
        for (let apc of this)
        {
        }
        return undefined;
    }
}


/**
 * Dump the APCs associated to a thread
 *
 * Can be filtered by process address:
 * dx @$curprocess.APCs[ $ThreadAddress ]
 */
class ThreadApcIterator
{
    constructor(thread)
    {
        this.__Thread = thread;
    }

    get Thread()
    {
        return this.__Thread;
    }

    get Process()
    {
        return this.__Thread.Process;
    }

    *[Symbol.iterator]()
    {
        let KApcState = this.__Thread.Tcb.ApcState;

        for(let i=0; i<2; i++)
        {
            if(i == 0)
            {
                // -- KERNEL
                if ((KApcState.KernelApcPending & 0b01) == 0)
                {
                    continue;
                }
            }
            else
            {
                // -- USER
                if ((KApcState.UserApcPendingAll & 0b10) == 0)
                {
                    continue;
                }
            }

            let ApcIterator = host.namespace.Debugger.Utility.Collections.FromListEntry(
                KApcState.ApcListHead[i],
                "nt!_KAPC",
                "ApcListEntry"
            );

            for(let Apc of ApcIterator)
            {
                yield new ApcObject(Apc);
            }
        }
    }

    toString()
    {
        return `Thread=0x${hex(this.Thread.address)}, ApcCount=${this.ApcCount}`;
    }

    get ApcCount()
    {
        let count = 0;
        for(let Apc of this){ count++; }
        return count;
    }
}


/**
 * Dump the APCs of all threads of a specific process
 *
 * Can be filtered by thread address:
 * `dx @$curprocess[ThreadId]`
 */
class ProcessApcIterator
{
    constructor(process)
    {
        this.__Process = process;
    }

    __getThreadIterator()
    {
        return host.namespace.Debugger.Utility.Collections.FromListEntry(
            this.__Process.ThreadListHead,
            "nt!_ETHREAD",
            "ThreadListEntry"
        );
    }

    getDimensionality()
    {
        return 1;
    }

    getValueAt(idx)
    {
        for(let Thread of this.__getThreadIterator())
        {
            let Tid = Thread.Cid.UniqueThread.address;
            if(Tid.compareTo(idx) == 0)
            {
                return new ThreadApcIterator(Thread);
            }

        }
        return undefined;
    }

    *[Symbol.iterator]()
    {
        for(let Thread of this.__getThreadIterator())
        {
            let index = Thread.Cid.UniqueThread.address;
            let value = new ThreadApcIterator(Thread);
            if(value.ApcCount > 0)
                yield new host.indexedValue(value, [index]);
        }
    }

    get Process()
    {
        return this.__Process;
    }

    toString()
    {
        let ProcessName = host.memory.readString(this.Process.ImageFileName.address);
        return `Process='${ProcessName}' @ ${hex(this.Process.address)}, Threads=${this.ThreadCount}, NumberOfApcs=${this.ApcCount}`;
    }

    get ApcCount()
    {
        let nb_apc = 0;
        for(let Thread of this.__getThreadIterator())
        {
            nb_apc += (new ThreadApcIterator(Thread)).ApcCount;
        }
        return nb_apc;
    }

    get ThreadCount()
    {
        let count = 0;
        for(let Apc of this.__getThreadIterator()){ count++; }
        return count;
    }
}

/**
 * Dump system APCs
 *
 * Can dump a specific process by address
 * dx @$SystemApcs[ $ProcessAddress ]
 */
class SystemApcIterator
{
    getDimensionality()
    {
        return 1;
    }

    getValueAt(idx)
    {
        let Processes = host.namespace.Debugger.State.DebuggerVariables.cursession.Processes;
        for(let Process of Processes)
        {
            let Pid = Process.Id;
            if(Pid.compareTo(idx) == 0)
            {
                return new ProcessApcIterator(Process.KernelObject);
            }
        }

        return undefined;
    }

    *[Symbol.iterator]()
    {
        let Processes = host.namespace.Debugger.State.DebuggerVariables.cursession.Processes;
        for(let Process of Processes)
        {
            let index = Process.Id;
            let value = new ProcessApcIterator(Process.KernelObject);
            if(value.ApcCount > 0)
                yield new host.indexedValue(value, [index]);
        }
    }

    toString()
    {
        return `SystemApcIterator`;
    }
}


/**
 *
 */
class SessionModelExtension
{
    get APCs()
    {
        if(IsKd())
        {
            return new SystemApcIterator();
        }
    }
}

/**
 *
 */
class ProcessModelExtension
{
    get APCs()
    {
        if(IsKd())
        {
            return new ProcessApcIterator(this.KernelObject);
        }
    }
}


/**
 *
 */
class ThreadModelExtension
{
    get APCs()
    {
        if (IsKd())
        {
            return new ThreadApcIterator(this.KernelObject);
        }
    }
}


/**
 *
 * @returns
 */
function SystemApc()
{
    if (IsKd())
    {
        return new SystemApcIterator();
    }
}


/**
 *
 * @returns
 */
function invokeScript()
{
   return SystemApc();
}


/**
 *
 */
function initializeScript()
{
    log("[+] Initializing `EnumApc.js`...");
    return [
        new host.functionAlias(SystemApc, "SystemApcs"),
        new host.namedModelParent(SessionModelExtension, "Debugger.Models.Session"),
        new host.namedModelParent(ProcessModelExtension, "Debugger.Models.Process"),
        new host.namedModelParent(ThreadModelExtension, "Debugger.Models.Thread"),
        new host.apiVersionSupport(1, 3)
    ];
}

