///
/// <reference path="../extra/JSProvider.d.ts" />
///
"use strict";

/**
 *
 * Explore VADs of a process
 *
 * Usage:
 * kd> .scriptload z:\windbg_js_scripts\vadexplorer.js
 * kd> dx @$cursession.Processes[<pid>].KernelObject.Vads
 *
 */


const log = x => host.diagnostics.debugLog(`${x}\n`);
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const u32 = x => host.memory.readMemoryValues(x, 1, 4)[0];

const PAGE_NOACCESS = 0x01;
const PAGE_READONLY = 0x02;
const PAGE_READWRITE = 0x04;
const PAGE_WRITECOPY = 0x08;
const PAGE_EXECUTE = 0x10;
const PAGE_EXECUTE_READ = 0x20;
const PAGE_EXECUTE_READWRITE = 0x40;
const PAGE_EXECUTE_WRITECOPY = 0x80;
const PAGE_GUARD = 0x100;
const PAGE_NOCACHE = 0x200;
const PAGE_WRITECOMBINE = 0x400;

var PERMISSIONS = {};
PERMISSIONS[PAGE_EXECUTE] = "PAGE_EXECUTE";
PERMISSIONS[PAGE_EXECUTE_READ] = "PAGE_EXECUTE_READ";
PERMISSIONS[PAGE_EXECUTE_READWRITE] = "PAGE_EXECUTE_READWRITE";
PERMISSIONS[PAGE_EXECUTE_WRITECOPY] = "PAGE_EXECUTE_WRITECOPY";
PERMISSIONS[PAGE_NOACCESS] = "PAGE_NOACCESS";
PERMISSIONS[PAGE_READONLY] = "PAGE_READONLY";
PERMISSIONS[PAGE_READWRITE] = "PAGE_READWRITE";
PERMISSIONS[PAGE_WRITECOPY] = "PAGE_WRITECOPY";
PERMISSIONS[PAGE_GUARD] = "PAGE_GUARD";
PERMISSIONS[PAGE_NOCACHE] = "PAGE_NOCACHE";
PERMISSIONS[PAGE_WRITECOMBINE] = "PAGE_WRITECOMBINE";


const VadNone = 0;
const VadDevicePhysicalMemory = 1;
const VadImageMap = 2;
const VadAwe = 3;
const VadWriteWatch = 4;
const VadLargePages = 5;
const VadRotatePhysical = 6;
const VadLargePageSection = 7;

var VAD_TYPES = {};
VAD_TYPES[VadNone] = "VadNone";
VAD_TYPES[VadDevicePhysicalMemory] = "VadDevicePhysicalMemory";
VAD_TYPES[VadImageMap] = "VadImageMap";
VAD_TYPES[VadAwe] = "VadAwe";
VAD_TYPES[VadWriteWatch] = "VadWriteWatch";
VAD_TYPES[VadLargePages] = "VadLargePages";
VAD_TYPES[VadRotatePhysical] = "VadRotatePhysical";
VAD_TYPES[VadLargePageSection] = "VadLargePageSection";


function SizeAsHumanReadableString(size) {
    let step = 1024;
    if (Math.abs(size) < step)
        return `${size}B`;

    let units = ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    let u = -1;
    do {
        size /= step;
        ++u;
    }
    while (Math.abs(size) >= step && u < units.length - 1);
    return `${size.toFixed(1)}${units[u]}`;
}


function MakeQword(hi, lo) {
    return hi.bitwiseShiftLeft(32).add(lo);
}


function AlignHexString(value) {
    return value.toString(16).padStart(10, "0");
}


/**
 *
 */
class Vad {
    /**
     *
     */
    constructor(level, address, pMmProtectToValue) {
        this.Level = level;
        this.Address = address;
        this.VadObject = host.createTypedObject(this.Address, "nt", "_MMVAD");

        //
        // The 4-bit protection does *not* match the traditional values, but is an index
        // to `nt!MmProtectToValue` array.
        //
        this.__ProtectionIndex = this.VadObject.Core.u.VadFlags.Protection;
        this.__MmProtectToValue = pMmProtectToValue;
        this.__Protection = u32(this.__MmProtectToValue.add(4 * this.__ProtectionIndex));

        //
        // The 3-bit is an index in VAD_TYPES (see MI_VAD_TYPES - https://www.nirsoft.net/kernel_struct/vista/MI_VAD_TYPE.html)
        //
        this.__VadType = this.VadObject.Core.u.VadFlags.VadType;
        this.VpnStart = MakeQword(this.VadObject.Core.StartingVpnHigh, this.VadObject.Core.StartingVpn);
        this.VaStart = this.VpnStart.bitwiseShiftLeft(12);
        this.VpnEnd = MakeQword(this.VadObject.Core.EndingVpnHigh, this.VadObject.Core.EndingVpn);
        this.VaEnd = this.VpnEnd.add(1).bitwiseShiftLeft(12);
        this.Size = host.parseInt64(this.VaEnd - this.VaStart);
    }


    /**
     *
     */
    get Protection() {
        var p = [];
        if (this.__Protection & PAGE_EXECUTE)
            p.push(PERMISSIONS[this.__Protection & PAGE_EXECUTE]);
        if (this.__Protection & PAGE_EXECUTE_READ)
            p.push(PERMISSIONS[this.__Protection & PAGE_EXECUTE_READ]);
        if (this.__Protection & PAGE_EXECUTE_READWRITE)
            p.push(PERMISSIONS[this.__Protection & PAGE_EXECUTE_READWRITE]);
        if (this.__Protection & PAGE_EXECUTE_WRITECOPY)
            p.push(PERMISSIONS[this.__Protection & PAGE_EXECUTE_WRITECOPY]);
        if (this.__Protection & PAGE_NOACCESS)
            p.push(PERMISSIONS[this.__Protection & PAGE_NOACCESS]);
        if (this.__Protection & PAGE_READONLY)
            p.push(PERMISSIONS[this.__Protection & PAGE_READONLY]);
        if (this.__Protection & PAGE_READWRITE)
            p.push(PERMISSIONS[this.__Protection & PAGE_READWRITE]);
        if (this.__Protection & PAGE_WRITECOPY)
            p.push(PERMISSIONS[this.__Protection & PAGE_WRITECOPY]);
        if (this.__Protection & PAGE_GUARD)
            p.push(PERMISSIONS[this.__Protection & PAGE_GUARD]);
        if (this.__Protection & PAGE_NOCACHE)
            p.push(PERMISSIONS[this.__Protection & PAGE_NOCACHE]);
        if (this.__Protection & PAGE_WRITECOMBINE)
            p.push(PERMISSIONS[this.__Protection & PAGE_WRITECOMBINE]);
        return p.join("|");
    }


    /**
     *
     */
    get VadType() {
        return VAD_TYPES[this.__VadType];
    }


    /**
     *
     */
    get Filename() {
        if (this.__VadType == VadNone)
            return "";

        try {
            let ControlArea = host.createTypedObject(this.VadObject.Subsection.ControlArea.address, "nt", "_CONTROL_AREA");
            let FileObjectAddress = ControlArea.FilePointer.Value.bitwiseAnd(-16);
            let FileObject = host.createTypedObject(FileObjectAddress, "nt", "_FILE_OBJECT");
            return host.memory.readWideString(FileObject.FileName.Buffer.address, FileObject.FileName.Length / 2);
        }
        catch (e) {
            return "";
        }
    }

    /**
     *
     */
    IsInRange(address) {
        return (address.compareTo(this.VaStart) >= 0 && address.compareTo(this.VaEnd) < 0);
    }

    /**
     *
     */
    toString() {
        let txt = "VAD(";
        txt += `Address=${this.Address.toString(16)}, VpnStart=${AlignHexString(this.VpnStart)}, VpnEnd=${AlignHexString(this.VpnEnd)}`
        txt += `, Protection=${this.Protection}, VadType=${this.VadType}`;
        txt += `, Size=${SizeAsHumanReadableString(this.Size)}`;

        if (this.Filename)
            txt += `, Filename=${this.Filename}`;
        txt += ")";
        return txt;
    }
}


class VadList {

    /**
     *
     */
    constructor(process) {
        this.__process = process;
        this.__entries_by_level = new Array();
        this.__pMmProtectToValue = host.getModuleSymbolAddress("nt", "MmProtectToValue");
    }


    /**
     * MaxLevel getter
     */
    get MaxLevel() {
        let MaxLevel = 0;

        for (let vad of this) {
            if (vad.Level > MaxLevel)
                MaxLevel = vad.Level;
        }

        return MaxLevel;
    }


    /**
     * Average level getter
     */
    get AverageLevel() {
        return this.__entries_by_level.indexOf(Math.max(...this.__entries_by_level));
    }


    /**
     * Process getter
     */
    get Process() {
        return this.__process;
    }

    /**
     * Help
     */
    get [Symbol.metadataDescriptor]() {
        return {
            Process:
            {
                PreferShow: true,
                Help: "Pointer to the current process."
            },

            MaxLevel: {
                PreferShow: true,
                Help: "The maximum level of recursion for the process's VADs."
            },
        };
    }


    /**
     *
     */
    *[Symbol.iterator]() {
        for (let vad of this.__Walk(0, this.__process.VadRoot.Root.address))
            yield vad;
    }


    /**
     *
     */
    *__Walk(level, VadAddress) {
        var nodeObject = host.createTypedObject(VadAddress, "nt", "_RTL_BALANCED_NODE");

        if (nodeObject.isNull || nodeObject.Left == undefined || nodeObject.Right == undefined)
            return;

        if (this.__entries_by_level.length < level + 1)
            this.__entries_by_level.push(0);

        this.__entries_by_level[level] += 1;

        yield new Vad(level, VadAddress, this.__pMmProtectToValue);

        if (nodeObject.Left)
            yield* this.__Walk(level + 1, nodeObject.Left.address);

        if (nodeObject.Right)
            yield* this.__Walk(level + 1, nodeObject.Right.address);
    }

    /**
     * The function looks for the vad entry that describes the range that contains the address.
     *
     * @param {host.Int64} virtualAddress An address to find in the process
     * @returns {Vad} If the function finds the VAD, it returns a Vad object, else it returns null
     */
    LookupVad(virtualAddress) {
        var currentLevel = 0;
        var currentVadAddress = this.__process.VadRoot.Root.address;

        while (currentVadAddress.compareTo(0) != 0) {
            var currentVad = new Vad(currentLevel, currentVadAddress, this.__pMmProtectToValue);

            if (currentVad.IsInRange(virtualAddress)) {
                return currentVad;
            }

            currentLevel += 1;

            var currentNodeObject = host.createTypedObject(currentVadAddress, "nt", "_RTL_BALANCED_NODE");

            if (currentVad.VaStart.compareTo(virtualAddress) > 0) {
                currentVadAddress = currentNodeObject.Left.address;
            }
            else {
                currentVadAddress = currentNodeObject.Right.address;
            }
        }

        return null;
    }
}


/**
 *
 */
class ProcessVads {
    get Vads() {
        return new VadList(this);
    }
}


/**
 *
 */
function initializeScript() {
    //log("[+] Extending EPROCESS with Vads property...");

    return [
        new host.apiVersionSupport(1, 3),
        new host.typeSignatureExtension(ProcessVads, "_EPROCESS"),
    ];
}