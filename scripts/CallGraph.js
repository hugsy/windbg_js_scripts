///
/// <reference path="JSProvider.d.ts" />
///
"use strict";

/**
 *
 * Generate a callgraph from function name visible with MermaidJS
 *
 *
 * Usage
 * windbg> .scriptload \\ph0ny\code\windbg_js_scripts\CallGraph.js
 *
 * Example
 * windbg> !callgraph "ntdll!NtCreateFile"
 * or
 * windbg> dx @$callgraph("0x41424344")
 * or
 * windbg> !callgraph
 */

const log = x => host.diagnostics.debugLog(`${x}\n`);
const ok = x => log(`[+] ${x}`);
const warn = x => log(`[!] ${x}`);
const err = x => log(`[-] ${x}`);
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const u8 = x => host.memory.readMemoryValues(x, 1, 1)[0];
const u16 = x => host.memory.readMemoryValues(x, 1, 2)[0];
const u32 = x => host.memory.readMemoryValues(x, 1, 4)[0];
const u64 = x => host.memory.readMemoryValues(x, 1, 8)[0];

function IsX64() { return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize == 8; }
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }
function $(r) { if (!IsKd()) return host.currentThread.Registers.User[r]; else return host.namespace.Debugger.State.DebuggerVariables.curprocess.Threads.First().Registers.User[r] || host.namespace.Debugger.State.DebuggerVariables.curprocess.Threads.First().Registers.Kernel[r]; }
function GetSymbolFromAddress(x) { return system(`.printf "%y", ${x.toString(16)}`).First(); }

var g_OutfileName;


/**
 *
 */
function GetAddressFromSymbol(sym) {
    if (sym.indexOf("!") == -1) {
        let default_modules = ["nt", "ntdll", "kernel32", "kernelbase"];
        for (let mod of default_modules) {
            var res = host.getModuleSymbolAddress(mod, sym);
            if (res != undefined) {
                return res;
            }
        }
        return null;
    }
    var parts = sym.split("!");
    var res = host.getModuleSymbolAddress(parts[0], parts[1]);

    if (res === undefined || res === null) {
        for (let line of system(`x ${sym}`)) {
            if (line.includes(sym)) {
                res = host.parseInt64(line.split(" ")[0], 16);
                break;
            }
        }
    }

    return res;
}


/**
 *
 */
function GetBasicBlockIdByAddress(BasicBlocks, Address) {
    var i = 0;

    for (let BasicBlock of BasicBlocks) {
        //let s1 = Address.toString(16);
        //let s2 = BasicBlock.StartAddress.toString(16);
        //let s3 = BasicBlock.EndAddress.toString(16);
        //log(`${i} ${s1} in [${s2}, ${s3}[`);
        if (BasicBlock.StartAddress.compareTo(Address) <= 0 && BasicBlock.EndAddress.compareTo(Address) > 0) {
            return i;
        }

        i++;
    }

    return undefined;
}


/**
 *
 */
function CallGraph(location) {
    let target;
    const pc = host.namespace.Debugger.State.PseudoRegisters.RegisterAliases.ip;

    if (location === undefined) {
        target = pc;
    }
    else if (location.toString().startsWith("0x")) {
        target = host.parseInt64(location);
    }
    else {
        target = GetAddressFromSymbol(location);
    }

    ok(`target=${target}`);

    if (target === undefined || target === null) {
        err("No valid location provided");
        return
    }

    let dis = host.namespace.Debugger.Utility.Code.CreateDisassembler();
    let fun = dis.DisassembleFunction(target);
    let bbs = fun.BasicBlocks; //.ToArray();
    // let bbs = dis.DisassembleBlocks(target);
    let nb_bbs = bbs.Count();

    ok(`Found ${nb_bbs} basic blocks at ${target}`);
    if (nb_bbs == 0) {
        return;
    }


    //
    // create the basic blocks
    //

    const title = location ? `${location} (${target.toString(16)})` : target.toString();
    let OutputStr = `<html><head><title>${title}</title><script src='https://cdnjs.cloudflare.com/ajax/libs/mermaid/8.0.0/mermaid.min.js'/></head>`;
    OutputStr += "<body></script><script>mermaid.initialize({startOnLoad:true});</script>";
    OutputStr += "<div class='mermaid'>\n";
    OutputStr += "graph TD\n\n";

    ok("Create the nodes...");

    let i = 0;

    for (let bb of bbs) {
        const BlockName = i.toString();
        let HighlighBlock = false;

        OutputStr += `${BlockName}("\n`;

        for (let ins of bb.Instructions) {
            if (ins.Address.compareTo(pc) === 0) {
                OutputStr += "<b>";
                HighlighBlock = true;
            }

            OutputStr += `<code>[0x${ins.Address.toString(16)}] ${ins.toString()}</code>   <br/>\n`;

            if (ins.Address.compareTo(pc) === 0) {
                OutputStr += "</b>";
            }
        }

        OutputStr += '")\n';

        if (HighlighBlock === true) {
            OutputStr += `style ${BlockName} fill:#FF4444,stroke:#333,stroke-width:4px\n`;
        }

        i++;
    }


    // log("[+] Link the nodes...");


    for (let bb of bbs) {
        let LastInsn = bb.Instructions.Last();
        let CurrentBasicBlockId = GetBasicBlockIdByAddress(bbs, LastInsn.Address);

        for (let obb of bb.OutboundControlFlows) {
            let NextBasicBlockId = GetBasicBlockIdByAddress(bbs, obb.LinkedBlock.StartAddress);
            OutputStr += `${CurrentBasicBlockId} --> ${NextBasicBlockId}\n`;
        }
    }

    OutputStr += "</div></body></html>";


    //
    // now write to file
    //

    g_OutfileName = host.namespace.Debugger.Utility.FileSystem.TempDirectory + "\\WinDbgCallGraph.html";

    let hFile = host.namespace.Debugger.Utility.FileSystem.CreateFile(g_OutfileName, "CreateAlways");
    let TextWriter = host.namespace.Debugger.Utility.FileSystem.CreateTextWriter(hFile);
    TextWriter.WriteLine(OutputStr);
    hFile.Close();

    g_OutfileName = host.namespace.Debugger.Utility.FileSystem.TempDirectory + "\\WinDbgCallGraph.html";
    log(`[+] Graph stored in '${g_OutfileName}'`);
}


/**
 *
 */
function initializeScript() {
    return [
        new host.functionAlias(CallGraph, "callgraph"),
    ];
}

