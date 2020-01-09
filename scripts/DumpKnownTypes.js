/**
 *
 * Dynamic dumping of known object types of Windows (_OBJECT_HEADER->Type)
 *
 * OBSOLETE: Use ObjectExplorer.js
 */
"use strict";

var log = x => host.diagnostics.debugLog(x + "\n");

function DumpTypeIndex()
{
    var ReadWideString = host.memory.readWideString;

    // Get symbol from ntoskrnl
    var ObTypeIndexTableAddress = host.getModuleSymbolAddress("nt","ObTypeIndexTable");

    // Create a typed variable (type = _OBJECT_TYPE**)
    var pObTypeIndexTable = host.createPointerObject(ObTypeIndexTableAddress, "nt", "_OBJECT_TYPE **");
    var i = 2;

    while(true)
    {
        try
        {
            //
            // Note that we can use directly structure component (recursively)
            // kd> dt _OBJECT_TYPE
            // nt!_OBJECT_TYPE
            // +0x000 TypeList         : _LIST_ENTRY
            // +0x010 Name             : _UNICODE_STRING
            // [...]
            //
            // kd> dt _UNICODE_STRING
            // nt!_UNICODE_STRING
            //    +0x000 Length           : Uint2B
            //    +0x002 MaximumLength    : Uint2B
            //    +0x008 Buffer           : Ptr64 Wchar
            //
            let ObjectName = ReadWideString(pObTypeIndexTable[i].Name.Buffer);
            log(`- Type[${i}] = '${ObjectName}'`);
            i++
        }
        catch(err)
        {
            // Reaching the end of the table will trigger an access violation, caught by JS, so we can exit
            break;
        }
    }

    return;
}


function invokeScript()
{
    DumpTypeIndex();
    return;
}
