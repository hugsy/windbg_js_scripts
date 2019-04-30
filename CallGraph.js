/**
 *
 * Generate a callgraph from function name visible with MermaidJS
 *
 * Note for people without a sense of humor:
 * This script was made as a troll following this (https://twitter.com/aionescu/status/1052385986045345794)
 * and never as a replacement to IDA
 *
 * Usage
 * windbg> .scriptload \\ph0ny\code\windbg_js_scripts\CallGraph.js
 *
 * Example
 * windbg> !callgraph "ntdll!NtCreateFile"
 * or
 * windbg> !callgraph 0x41424344
 * or
 * windbg> !callgraph
 */

"use strict";

const log = x => host.diagnostics.debugLog(x + "\n");
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const u8 = x => host.memory.readMemoryValues(x, 1, 1)[0];
const u16 = x => host.memory.readMemoryValues(x, 1, 2)[0];
const u32 = x => host.memory.readMemoryValues(x, 1, 4)[0];
const u64 = x => host.memory.readMemoryValues(x, 1, 8)[0];

function IsX64(){return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize == 8;}
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }
function $(r){ if(!IsKd()) return host.currentThread.Registers.User[r]; else return host.namespace.Debugger.State.DebuggerVariables.curprocess.Threads.First().Registers.User[r] || host.namespace.Debugger.State.DebuggerVariables.curprocess.Threads.First().Registers.Kernel[r]; }
function GetSymbolFromAddress(x){ return system('.printf "%y", ' + x.toString(16)).First(); }

var g_OutfileName ;


/**
 *
 */
function GetAddressFromSymbol(sym)
{
    if (sym.indexOf("!") == -1)
    {
        let default_modules = ["nt", "ntdll", "kernel32", "kernelbase"];
        for (let mod of default_modules)
        {
            var res = host.getModuleSymbolAddress(mod, sym);
            if (res != undefined)
            {
                return res;
            }
        }
        return null;
    }
    var parts = sym.split("!");
    return host.getModuleSymbolAddress(parts[0], parts[1]);
}


/**
 *
 */
function GetBasicBlockIdByAddress(BasicBlocks, Address)
{
    var i = 0;

    for( let BasicBlock of BasicBlocks )
    {
        let s1 = Address.toString(16);
        let s2 = BasicBlock.StartAddress.toString(16);
        let s3 = BasicBlock.EndAddress.toString(16);
        //log(`${i} ${s1} in [${s2}, ${s3}[`);
        if(BasicBlock.StartAddress.compareTo(Address) <= 0 && BasicBlock.EndAddress.compareTo(Address) > 0)
        {
            return i;
        }

        i = i + 1;
    }

    return undefined;
}


/**
 *
 */
function CallGraph(location)
{
    let target;
    let pc;

    try
    {
        pc = IsX64() ? $("rip") : $("eip");
    }
    catch(e)
    {
        pc = 0;
    }

    if(location === undefined)
    {
        target = pc;
    }
    else if (location.toString().startsWith("0x"))
    {
        target = host.evaluateExpression(location);
    }
    else
    {
        target = GetAddressFromSymbol(location);
    }

    if(target === undefined || target === null)
    {
        log("[-] unknown target");
        return
    }

    let dis = host.namespace.Debugger.Utility.Code.CreateDisassembler();
    let bbs = dis.DisassembleFunction(target).BasicBlocks.ToArray();
    let nb_bbs = bbs.Count();

    // log("[+] Found " + nb_bbs.toString() + " basic blocks");

    if (nb_bbs == 0)
    {
        return;
    }


    //
    // create the basic blocks
    //

    var title = location ? location : target.toString();

    var OutputStr = "";
    OutputStr += `<html><head><title>${title}</title><script src='https://cdnjs.cloudflare.com/ajax/libs/mermaid/8.0.0/mermaid.min.js'/></head>`;
    OutputStr += "<body></script><script>mermaid.initialize({startOnLoad:true});</script>";
    OutputStr += "<div class='mermaid'>\n";
    OutputStr += "graph TD\n\n";

    // log("[+] Create the nodes...");

    var i = 0;


    for( let bb of bbs )
    {
        let BlockName = i.toString();
        let HighlighBlock = false;

        OutputStr += `${BlockName}("\n`;

        for( let ins of bb.Instructions)
        {
            if (ins.Address == pc)
            {
                OutputStr += "<b>";
                HighlighBlock = true;
            }

            OutputStr += `<code>[0x${ins.Address.toString(16)}] ${ins.toString() }</code>   <br/>\n`;

            if (ins.Address == pc)
            {
                OutputStr += "</b>";
            }
        }

        OutputStr += '")\n';

        if (HighlighBlock === true)
        {
            OutputStr+= `style ${BlockName} fill:#FF4444,stroke:#333,stroke-width:4px\n`;
        }

        i++;
    }


    // log("[+] Link the nodes...");


    for( let bb of bbs )
    {
        let LastInsn = bb.Instructions.Last();
        let CurrentBasicBlockId = GetBasicBlockIdByAddress(bbs, LastInsn.Address);

        for (let obb of bb.OutboundControlFlows)
        {
            let NextBasicBlockId = GetBasicBlockIdByAddress(bbs, obb.LinkedBlock.StartAddress);
            OutputStr +=  `${CurrentBasicBlockId} --> ${NextBasicBlockId}\n` ;
        }
    }

    OutputStr += "</div></body></html>";


    //
    // now write to file
    //

    g_OutfileName = host.namespace.Debugger.Utility.FileSystem.TempDirectory + "\\WinDbgCallGraph.html" ;

    let hFile = host.namespace.Debugger.Utility.FileSystem.CreateFile(g_OutfileName, "CreateAlways");
    let TextWriter = host.namespace.Debugger.Utility.FileSystem.CreateTextWriter(hFile);
    TextWriter.WriteLine(OutputStr);
    hFile.Close();

    g_OutfileName = host.namespace.Debugger.Utility.FileSystem.TempDirectory + "\\WinDbgCallGraph.html" ;
    log(`[+] Graph stored in '${g_OutfileName}'`);
}


/**
 *
 */
function initializeScript()
{
    return [
        new host.functionAlias(CallGraph, "callgraph"),
    ];
}

