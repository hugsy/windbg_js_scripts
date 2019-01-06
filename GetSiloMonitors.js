/**
 * Enumerate all Silo Monitors
 *
 * All kudos to https://twitter.com/aionescu/status/1069738308924780545
 *
 * Usage:
 * kd> .scriptload z:\windbg_js_scripts\getsilomonitors.js
 * kd> dx @$SiloMonitors()
 *
 * Example:
 * kd> dx @$SiloMonitors().Where( sm => sm.Name == "\\Driver\\HTTP")
 * @$SiloMonitors().Where( sm => sm.Name == "\\Driver\\HTTP")
 *     [0x0]            :
 * SlotIndex 17
 * 	Name: '\Driver\HTTP'
 * 	SlotData: 0xffffda8695a37040
 * 	CreateCallback: HTTP!UxPodSiloCreateCallback (fffff800`3d601380)
 * 	DestroyCallback: HTTP!UxPodSiloTerminateCallback (fffff800`3d63e5c0)
 */

"use strict";

const log = x => host.diagnostics.debugLog(x + "\n");
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const u8 = x => host.memory.readMemoryValues(x, 1, 1)[0];
const u16 = x => host.memory.readMemoryValues(x, 1, 2)[0];
const u32 = x => host.memory.readMemoryValues(x, 1, 4)[0];
const u64 = x => host.memory.readMemoryValues(x, 1, 8)[0];
const Dereference = addr => host.evaluateExpression("(unsigned int*)0x" + addr.toString(16)).dereference();

function ReadWideString (x) { return host.memory.readWideString(x); };
function IsX64(){return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize == 8;}
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }
function $(r){ if(!IsKd()) return host.currentThread.Registers.User[r]; else return host.namespace.Debugger.State.DebuggerVariables.curprocess.Threads.First().Registers.User[r] || host.namespace.Debugger.State.DebuggerVariables.curprocess.Threads.First().Registers.Kernel[r]; }
function GetSymbolFromAddress(x){ return system('.printf "%y", ' + x.toString(16)).First(); }




class SiloMonitor
{
    constructor(Address)
    {
        //
        // dx @$siloMonitor = (x => new {
        //    SlotIndex = *(int*)(x+0x14),
        //    SlotData = (void*)@$getSlot(*(int*)(x+0x14)),
        //    CreateCallback = @$getsym(x+0x18),
        //    DestroyCallback = @$getsym(x+0x20),
        //    Name = *(nt!_UNICODE_STRING*)(x+0x28)
        // });
        //
        this.Address = Address;
        this.SlotIndex = u32(this.Address.add(0x14));
        this.SlotData = GetSlot(this.SlotIndex);
        this.CreateCallback = GetSymbolFromAddress(u64(this.Address.add(0x18)));
        this.DestroyCallback = GetSymbolFromAddress(u64(this.Address.add(0x20)));
        let UnicodeName = host.createPointerObject(this.Address.add(0x28), "nt", "_UNICODE_STRING*");
        this.Name =  host.memory.readWideString(UnicodeName.Buffer, UnicodeName.Length/2);
    }

    toString()
    {
        return `\nSlotIndex: ${this.SlotIndex}\n\tName: '${this.Name}'\n\tSlotData: ${this.SlotData}\n\tCreateCallback: ${this.CreateCallback}\n\tDestroyCallback: ${this.DestroyCallback}`;
    }
}


/**
 *
 */
function GetSlot(index)
{
    //
    // dx @$storage = ((nt!_ESERVERSILO_GLOBALS*)&nt!PspHostSiloGlobals)->Storage;
    //
    let PspHostSiloGlobals = host.createPointerObject(host.getModuleSymbolAddress("nt", "PspHostSiloGlobals"), "nt", "_ESERVERSILO_GLOBALS*");
    let Storage = PspHostSiloGlobals.Storage;
    //log("HostSiloGlobalsSilo->Storage = " + Storage.address.toString(16));

    //
    // dx @$getSlot = (x => ((void**)@$storage)[x * 2 + 1] & ~1);
    //
    let SlotArray = host.evaluateExpression("(void**)0x" + Storage.address.toString(16));
    let Slot = SlotArray[2*index + 1];
    return Slot.address.bitwiseAnd(~1);
}


/**
 *
 */
function *GetSiloMonitorIterator()
{
    let PspSiloMonitorListHead = host.createPointerObject(
        host.getModuleSymbolAddress("nt", "PspSiloMonitorList"),
        "nt",
        "_LIST_ENTRY*"
    );

    var Cur = PspSiloMonitorListHead.Flink;

    while (Cur.address != PspSiloMonitorListHead.address)
    {
        let CurSiloMon = new SiloMonitor(Cur.address);
        yield CurSiloMon;
        Cur = Cur.Flink;
    }
}


/**
 *
 */
function invokeScript()
{
    for (var sm of GetSiloMonitorIterator())
    {
        log(sm.toString());
    }
}


/**
 *
 */
function initializeScript()
{
    log("[+] Creating the variable `SiloMonitors`...");
    return [
        new host.functionAlias(GetSiloMonitorIterator, "SiloMonitors"),
    ];
}
