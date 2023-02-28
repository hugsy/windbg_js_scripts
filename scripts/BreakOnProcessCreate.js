///
/// <reference path="../extra/JSProvider.d.ts" />
///
/// @ts-check
///
"use strict";


/**
 *
 * Template file for new WinDbg JS scripts
 *
 */

const log = x => host.diagnostics.debugLog(`${x}\n`);
const ok = x => log(`[+] ${x}`);
const warn = x => log(`[!] ${x}`);
const err = x => log(`[-] ${x}`);
const hex = x => x.toString(16);
const i64 = x => host.parseInt64(x);
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const u8 = x => host.memory.readMemoryValues(x, 1, 1)[0];
const u16 = x => host.memory.readMemoryValues(x, 1, 2)[0];
const u32 = x => host.memory.readMemoryValues(x, 1, 4)[0];
const u64 = x => host.memory.readMemoryValues(x, 1, 8)[0];
const FIELD_OFFSET = (t, n) => parseInt(system(`?? #FIELD_OFFSET(${t}, ${n})`).First().split(" ")[1].replace("0n", ""));
const CONTAINING_RECORD = (a, t, n) => a.substract(FIELD_OFFSET(t, n));

function curthread() { return host.namespace.Debugger.State.DebuggerVariables.curthread; }
function curprocess() { return host.namespace.Debugger.State.DebuggerVariables.curprocess; }
function cursession() { return host.namespace.Debugger.State.DebuggerVariables.cursession; }
function ptrsize() { return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize; }
function pagesize() { return host.namespace.Debugger.State.PseudoRegisters.General.pagesize; }
function IsX64() { return ptrsize() === 8; }
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }
function $(r) { return IsKd() ? host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.User[r] || host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.Kernel[r] : host.namespace.Debugger.State.DebuggerVariables.curthread.Registers.User[r]; }
function GetSymbolFromAddress(x) { return system(`.printf "%y", ${x.toString(16)}`).First(); }
function poi(x) { return IsX64() ? u64(x) : u32(x); }
function assert(condition) { if (!condition) { throw new Error("Assertion failed"); } }


/*
NTSTATUS NtCreateUserProcess(
    PHANDLE ProcessHandle,
    PHANDLE ThreadHandle,
    ACCESS_MASK ProcessDesiredAccess,
    ACCESS_MASK ThreadDesiredAccess,
    POBJECT_ATTRIBUTES ProcessObjectAttributes,
    POBJECT_ATTRIBUTES ThreadObjectAttributes,
    ULONG ProcessFlags,
    ULONG ThreadFlags,
    PRTL_USER_PROCESS_PARAMETERS ProcessParameters,
    PPS_CREATE_INFO CreateInfo,
    PPS_ATTRIBUTE_LIST AttributeList
)
*/
function NewProcessCallback(ImageName) {
    //
    // Examine the parameters of `nt!NtCreateUserProcess`, extract the process parameter arg, and
    // check the command line
    //
    const sp = $("rsp");
    const ProcessParameters = host.createTypedObject(
        u64(sp.add(ptrsize() * 9)),
        "nt",
        "_RTL_USER_PROCESS_PARAMETERS"
    );

    const CommandLine = ProcessParameters.ImagePathName.toString().toLowerCase();
    if (CommandLine.includes(ImageName) === false) {
        return false; // continue execution
    }

    //
    // The process is not created yet, collect `&ProcessHandle` and wait for the function to finish
    // successfully
    //
    const rcx = $("rcx");
    system("gu");
    const Status = $("rax");

    if (Status.compareTo(0) == 0) {
        const Handle = curprocess().Io.Handles[u32(rcx)];
        assert(Handle.Type == "Process");

        const Eprocess = host.createTypedObject(
            Handle.Object.UnderlyingObject.targetLocation.address,
            "nt",
            "_EPROCESS"
        );

        const Pid = Eprocess.UniqueProcessId.address;
        const Process = cursession().Processes[Pid];

        ok(`Breaking on '${ImageName}', EPROCESS: ${hex(Eprocess.address)}, PID: ${Pid}...`);
        Process.SwitchTo();
        return true;
    }

    return false;
}


function BreakOnNewProcess(ImageName) {
    if (!IsKd()) {
        err("Kernel Debugging Only");
        return;
    }

    const cmd = `bp /w "@$scriptContents.NewProcessCallback(\\"${ImageName.toLowerCase()}\\")" nt!NtCreateUserProcess`;
    system(cmd);
}


host.metadata.defineMetadata(this, { BreakOnNewProcess: { Help: "[KD] Break when a new process is created" } });


function invokeScript() {
    let args = ""; // <<- break on *all* processes
    BreakOnNewProcess(args);
}


function initializeScript() {
    return [
        new host.apiVersionSupport(1, 3),
        new host.functionAlias(BreakOnNewProcess, "pbreak"),
    ];
}

