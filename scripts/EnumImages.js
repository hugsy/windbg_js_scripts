/// <reference path="../extra/JSProvider.d.ts" />
"use strict";

Object.prototype.toString = function () {
    if (this.__Name !== undefined) { return `${this.__Name}` };
    if (this.__Path !== undefined) { return `${this.__Path}` };
    return ``;
};

/**
 *
 * Enumerate images for the currently debugged process.
 *
 * Works in KD too, use `dx @$cursession.Processes.Where().SwitchTo()` to modify the @$curprocess.
 * Also you might need to `.reload /f /user` (also `.pagein $addr` might be of use)
 *
 * Examples:
 * 0:000> .scriptload \path\to\EnumImages.js
 * 0:000> dx -g -r1 @$curprocess.Images.Where( x => x.Name == "ntdll.dll" )
 *
 * kd> .scriptload \path\to\EnumImages.js
 * kd> dx @$cursession.Images.Where( x => x.Name.Contains("cdrom.sys") )
 *
 */


const log = x => host.diagnostics.debugLog(`${x}\n`);
const ok = x => log(`[+] ${x}`);
const warn = x => log(`[!] ${x}`);
const err = x => log(`[-] ${x}`);
const hex = x => x.toString(16);
const i64 = x => host.parseInt64(x);
const u8 = x => host.memory.readMemoryValues(x, 1, 1)[0];
const u16 = x => host.memory.readMemoryValues(x, 1, 2)[0];
const u32 = x => host.memory.readMemoryValues(x, 1, 4)[0];
const u64 = x => host.memory.readMemoryValues(x, 1, 8)[0];
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);
const dml = (cmd, title) => log(`<?dml?> <exec cmd="${cmd}">${title}</exec>`);

const sizeof = (x, y) => host.getModuleType(x, y).size;
function cursession() { return host.namespace.Debugger.State.DebuggerVariables.cursession; }
function GetSymbolFromAddress(x) { return host.getModuleContainingSymbolInformation(x); }
function IsX64() { return host.namespace.Debugger.State.PseudoRegisters.General.ptrsize === 8; }
function IsKd() { return host.namespace.Debugger.Sessions.First().Attributes.Target.IsKernelTarget === true; }
function BitmaskToString(mask, flags) {
    let str = [];
    let idx = 0;
    for (const key in flags) {
        if (mask & key) {
            str.push(flags[key]);
            idx |= key;
        }
    }
    if (idx != mask)
        str.push(`${(mask - idx).toString(0x10)}`);
    return str;
}

class TypedClass {
    constructor(raw) {
        this.Raw = raw;
        this.Address = raw.address;
    }
}

function createTypedObject(va, sym, args = {}) {
    const parts = sym.split("!", 2);
    const mod = parts[0];
    const name = parts[1];
    let obj = new TypedClass(new host.createTypedObject(va, mod, name));
    for (let arg in args) { obj[arg] = args[arg]; }
    return obj;
}

const FileHeaderFileMachineFlags = {
    0x0001: "IMAGE_FILE_MACHINE_TARGET_HOST",
    0x014c: "IMAGE_FILE_MACHINE_I386",
    0x0162: "IMAGE_FILE_MACHINE_R3000",
    0x0166: "IMAGE_FILE_MACHINE_R4000",
    0x0168: "IMAGE_FILE_MACHINE_R10000",
    0x0169: "IMAGE_FILE_MACHINE_WCEMIPSV2",
    0x0184: "IMAGE_FILE_MACHINE_ALPHA",
    0x01a2: "IMAGE_FILE_MACHINE_SH3",
    0x01a3: "IMAGE_FILE_MACHINE_SH3DSP",
    0x01a4: "IMAGE_FILE_MACHINE_SH3E",
    0x01a6: "IMAGE_FILE_MACHINE_SH4",
    0x01a8: "IMAGE_FILE_MACHINE_SH5",
    0x01c0: "IMAGE_FILE_MACHINE_ARM",
    0x01c2: "IMAGE_FILE_MACHINE_THUMB",
    0x01c4: "IMAGE_FILE_MACHINE_ARMNT",
    0x01d3: "IMAGE_FILE_MACHINE_AM33",
    0x01F0: "IMAGE_FILE_MACHINE_POWERPC",
    0x01f1: "IMAGE_FILE_MACHINE_POWERPCFP",
    0x0200: "IMAGE_FILE_MACHINE_IA64",
    0x0266: "IMAGE_FILE_MACHINE_MIPS16",
    0x0284: "IMAGE_FILE_MACHINE_ALPHA64",
    0x0366: "IMAGE_FILE_MACHINE_MIPSFPU",
    0x0466: "IMAGE_FILE_MACHINE_MIPSFPU16",
    0x0520: "IMAGE_FILE_MACHINE_TRICORE",
    0x0CEF: "IMAGE_FILE_MACHINE_CEF",
    0x0EBC: "IMAGE_FILE_MACHINE_EBC",
    0x8664: "IMAGE_FILE_MACHINE_AMD64",
    0x9041: "IMAGE_FILE_MACHINE_M32R",
    0xAA64: "IMAGE_FILE_MACHINE_ARM64",
    0xC0EE: "IMAGE_FILE_MACHINE_CEE",
};

const FileHeaderCharacteristicsFlags = {
    0x0001: "IMAGE_FILE_RELOCS_STRIPPED",
    0x0002: "IMAGE_FILE_EXECUTABLE_IMAGE",
    0x0004: "IMAGE_FILE_LINE_NUMS_STRIPPED",
    0x0008: "IMAGE_FILE_LOCAL_SYMS_STRIPPED",
    0x0010: "IMAGE_FILE_AGGRESIVE_WS_TRIM",
    0x0020: "IMAGE_FILE_LARGE_ADDRESS_AWARE",
    0x0080: "IMAGE_FILE_BYTES_REVERSED_LO",
    0x0100: "IMAGE_FILE_32BIT_MACHINE",
    0x0200: "IMAGE_FILE_DEBUG_STRIPPED",
    0x0400: "IMAGE_FILE_REMOVABLE_RUN_FROM_SWAP",
    0x0800: "IMAGE_FILE_NET_RUN_FROM_SWAP",
    0x1000: "IMAGE_FILE_SYSTEM",
    0x2000: "IMAGE_FILE_DLL",
    0x4000: "IMAGE_FILE_UP_SYSTEM_ONLY",
    0x8000: "IMAGE_FILE_BYTES_REVERSED_HI",
};

const OptionalHeaderSubsystemFlags = {
    0: "IMAGE_SUBSYSTEM_UNKNOWN",
    1: "IMAGE_SUBSYSTEM_NATIVE",
    2: "IMAGE_SUBSYSTEM_WINDOWS_GUI",
    3: "IMAGE_SUBSYSTEM_WINDOWS_CUI",
    5: "IMAGE_SUBSYSTEM_OS2_CUI",
    7: "IMAGE_SUBSYSTEM_POSIX_CUI",
    8: "IMAGE_SUBSYSTEM_NATIVE_WINDOWS",
    9: "IMAGE_SUBSYSTEM_WINDOWS_CE_GUI",
    10: "IMAGE_SUBSYSTEM_EFI_APPLICATION",
    11: "IMAGE_SUBSYSTEM_EFI_BOOT_SERVICE_DRIVER",
    12: "IMAGE_SUBSYSTEM_EFI_RUNTIME_DRIVER",
    13: "IMAGE_SUBSYSTEM_EFI_ROM",
    14: "IMAGE_SUBSYSTEM_XBOX",
    16: "IMAGE_SUBSYSTEM_WINDOWS_BOOT_APPLICATION",
    17: "IMAGE_SUBSYSTEM_XBOX_CODE_CATALOG",
};

const OptionalHeaderDllCharacteristicsFlags = {
    0x0001: "IMAGE_LIBRARY_PROCESS_INIT",
    0x0002: "IMAGE_LIBRARY_PROCESS_TERM",
    0x0004: "IMAGE_LIBRARY_THREAD_INIT",
    0x0008: "IMAGE_LIBRARY_THREAD_TERM",
    0x0020: "IMAGE_DLLCHARACTERISTICS_HIGH_ENTROPY_VA",
    0x0040: "IMAGE_DLLCHARACTERISTICS_DYNAMIC_BASE",
    0x0080: "IMAGE_DLLCHARACTERISTICS_FORCE_INTEGRITY",
    0x0100: "IMAGE_DLLCHARACTERISTICS_NX_COMPAT",
    0x0200: "IMAGE_DLLCHARACTERISTICS_NO_ISOLATION",
    0x0400: "IMAGE_DLLCHARACTERISTICS_NO_SEH",
    0x0800: "IMAGE_DLLCHARACTERISTICS_NO_BIND",
    0x1000: "IMAGE_DLLCHARACTERISTICS_APPCONTAINER",
    0x2000: "IMAGE_DLLCHARACTERISTICS_WDM_DRIVER",
    0x4000: "IMAGE_DLLCHARACTERISTICS_GUARD_CF",
    0x8000: "IMAGE_DLLCHARACTERISTICS_TERMINAL_SERVER_AWARE",
};

const OptionalHeaderDirectoryNames = {
    0: "IMAGE_DIRECTORY_ENTRY_EXPORT",
    1: "IMAGE_DIRECTORY_ENTRY_IMPORT",
    2: "IMAGE_DIRECTORY_ENTRY_RESOURCE",
    3: "IMAGE_DIRECTORY_ENTRY_EXCEPTION",
    4: "IMAGE_DIRECTORY_ENTRY_SECURITY",
    5: "IMAGE_DIRECTORY_ENTRY_BASERELOC",
    6: "IMAGE_DIRECTORY_ENTRY_DEBUG",
    7: "IMAGE_DIRECTORY_ENTRY_ARCHITECTURE",
    8: "IMAGE_DIRECTORY_ENTRY_GLOBALPTR",
    9: "IMAGE_DIRECTORY_ENTRY_TLS",
    10: "IMAGE_DIRECTORY_ENTRY_LOAD_CONFIG",
    11: "IMAGE_DIRECTORY_ENTRY_BOUND_IMPORT",
    12: "IMAGE_DIRECTORY_ENTRY_IAT",
    13: "IMAGE_DIRECTORY_ENTRY_DELAY_IMPORT",
    14: "IMAGE_DIRECTORY_ENTRY_COM_DESCRIPTOR",
};

const SectionCharacteristicsFlags = {
    0x00000008: "IMAGE_SCN_TYPE_NO_PAD",
    0x00000020: "IMAGE_SCN_CNT_CODE",
    0x00000040: "IMAGE_SCN_CNT_INITIALIZED_DATA",
    0x00000080: "IMAGE_SCN_CNT_UNINITIALIZED_DATA",
    0x00000100: "IMAGE_SCN_LNK_OTHER",
    0x00000200: "IMAGE_SCN_LNK_INFO",
    0x00000800: "IMAGE_SCN_LNK_REMOVE",
    0x00001000: "IMAGE_SCN_LNK_COMDAT",
    0x00004000: "IMAGE_SCN_NO_DEFER_SPEC_EXC",
    0x00008000: "IMAGE_SCN_GPREL",
    0x0000800: "IMAGE_SCN_MEM_FARDATA",
    0x0002000: "IMAGE_SCN_MEM_PURGEABLE",
    0x0002000: "IMAGE_SCN_MEM_16BIT",
    0x0004000: "IMAGE_SCN_MEM_LOCKED",
    0x0008000: "IMAGE_SCN_MEM_PRELOAD",
    0x00100000: "IMAGE_SCN_ALIGN_1BYTES",
    0x00200000: "IMAGE_SCN_ALIGN_2BYTES",
    0x00300000: "IMAGE_SCN_ALIGN_4BYTES",
    0x00400000: "IMAGE_SCN_ALIGN_8BYTES",
    0x00500000: "IMAGE_SCN_ALIGN_16BYTES",
    0x00600000: "IMAGE_SCN_ALIGN_32BYTES",
    0x00700000: "IMAGE_SCN_ALIGN_64BYTES",
    0x00800000: "IMAGE_SCN_ALIGN_128BYTES",
    0x00900000: "IMAGE_SCN_ALIGN_256BYTES",
    0x00A00000: "IMAGE_SCN_ALIGN_512BYTES",
    0x00B00000: "IMAGE_SCN_ALIGN_1024BYTES",
    0x00C00000: "IMAGE_SCN_ALIGN_2048BYTES",
    0x00D00000: "IMAGE_SCN_ALIGN_4096BYTES",
    0x00E00000: "IMAGE_SCN_ALIGN_8192BYTES",
    0x00F00000: "IMAGE_SCN_ALIGN_MASK",
    0x01000000: "IMAGE_SCN_LNK_NRELOC_OVFL",
    0x02000000: "IMAGE_SCN_MEM_DISCARDABLE",
    0x04000000: "IMAGE_SCN_MEM_NOT_CACHED",
    0x08000000: "IMAGE_SCN_MEM_NOT_PAGED",
    0x10000000: "IMAGE_SCN_MEM_SHARED",
    0x20000000: "IMAGE_SCN_MEM_EXECUTE",
    0x40000000: "IMAGE_SCN_MEM_READ",
    0x80000000: "IMAGE_SCN_MEM_WRITE",
};

const DynamicRelocationSymbolNames = {
    0x00000001: "IMAGE_DYNAMIC_RELOCATION_GUARD_RF_PROLOGUE",
    0x00000002: "IMAGE_DYNAMIC_RELOCATION_GUARD_RF_EPILOGUE",
    0x00000003: "IMAGE_DYNAMIC_RELOCATION_GUARD_IMPORT_CONTROL_TRANSFER",
    0x00000004: "IMAGE_DYNAMIC_RELOCATION_GUARD_INDIR_CONTROL_TRANSFER",
    0x00000005: "IMAGE_DYNAMIC_RELOCATION_GUARD_SWITCHTABLE_BRANCH",
    0x00000007: "IMAGE_DYNAMIC_RELOCATION_FUNCTION_OVERRIDE",
}

const BddCapabilityEnum = {
    0x00000000: "OVRDCAP_AMD64_ERMSB",
    0x00000001: "OVRDCAP_AMD64_FAST_SHORT_REPMOV",
    0x00000002: "OVRDCAP_AMD64_FAST_ZERO_LEN_REPMOV",
    0x00000003: "OVRDCAP_AMD64_FAST_SHORT_REPSTOSB",
    0x00000004: "OVRDCAP_AMD64_FAST_SHORT_REPCMPSB",
    0x00000005: "OVRDCAP_AMD64_USERMODE",
    0x00000006: "OVRDCAP_AMD64_KERNELMODE",
    0x00000007: "OVRDCAP_AMD64_CPU_MANUFACTURER_RECOGNIZED",
    0x00000008: "OVRDCAP_AMD64_CPU_MANUFACTURER_INTEL",
    0x00000009: "OVRDCAP_AMD64_CPU_MANUFACTURER_AMD",
    0x0000000A: "OVRDCAP_AMD64_CPU_MANUFACTURER_VIA",
    0x0000000B: "OVRDCAP_AMD64_CPU_MODEL_0",
    0x0000000C: "OVRDCAP_AMD64_CPU_MODEL_1",
    0x0000000D: "OVRDCAP_AMD64_CPU_MODEL_2",
    0x0000000E: "OVRDCAP_AMD64_CPU_MODEL_3",
    0x0000000F: "OVRDCAP_AMD64_CPU_MODEL_4",
    0x00000010: "OVRDCAP_AMD64_CPU_MODEL_5",
    0x00000011: "OVRDCAP_AMD64_CPU_MODEL_6",
    0x00000012: "OVRDCAP_AMD64_CPU_MODEL_7",
    0x00000013: "OVRDCAP_AMD64_CPU_MODEL_8",
    0x00000014: "OVRDCAP_AMD64_CPU_MODEL_9",
    0x00000015: "OVRDCAP_AMD64_CPU_MODEL_10",
    0x00000016: "OVRDCAP_AMD64_CPU_MODEL_11",
    0x00000017: "OVRDCAP_AMD64_CPU_MODEL_12",
    0x00000018: "OVRDCAP_AMD64_CPU_MODEL_13",
    0x00000019: "OVRDCAP_AMD64_CPU_MODEL_14",
    0x0000001A: "OVRDCAP_AMD64_CPU_MODEL_15",
    0x0000001B: "OVRDCAP_AMD64_CPU_EXTENDED_MODEL_0",
    0x0000001C: "OVRDCAP_AMD64_CPU_EXTENDED_MODEL_1",
    0x0000001D: "OVRDCAP_AMD64_CPU_EXTENDED_MODEL_2",
    0x0000001E: "OVRDCAP_AMD64_CPU_EXTENDED_MODEL_3",
    0x0000001F: "OVRDCAP_AMD64_CPU_EXTENDED_MODEL_4",
    0x00000020: "OVRDCAP_AMD64_CPU_EXTENDED_MODEL_5",
    0x00000021: "OVRDCAP_AMD64_CPU_EXTENDED_MODEL_6",
    0x00000022: "OVRDCAP_AMD64_CPU_EXTENDED_MODEL_7",
    0x00000023: "OVRDCAP_AMD64_CPU_EXTENDED_MODEL_8",
    0x00000024: "OVRDCAP_AMD64_CPU_EXTENDED_MODEL_9",
    0x00000025: "OVRDCAP_AMD64_CPU_EXTENDED_MODEL_10",
    0x00000026: "OVRDCAP_AMD64_CPU_EXTENDED_MODEL_11",
    0x00000027: "OVRDCAP_AMD64_CPU_EXTENDED_MODEL_12",
    0x00000028: "OVRDCAP_AMD64_CPU_EXTENDED_MODEL_13",
    0x00000029: "OVRDCAP_AMD64_CPU_EXTENDED_MODEL_14",
    0x0000002A: "OVRDCAP_AMD64_CPU_EXTENDED_MODEL_15",
    0x0000002B: "OVRDCAP_AMD64_CPU_FAMILY_0",
    0x0000002C: "OVRDCAP_AMD64_CPU_FAMILY_1",
    0x0000002D: "OVRDCAP_AMD64_CPU_FAMILY_2",
    0x0000002E: "OVRDCAP_AMD64_CPU_FAMILY_3",
    0x0000002F: "OVRDCAP_AMD64_CPU_FAMILY_4",
    0x00000030: "OVRDCAP_AMD64_CPU_FAMILY_5",
    0x00000031: "OVRDCAP_AMD64_CPU_FAMILY_6",
    0x00000032: "OVRDCAP_AMD64_CPU_FAMILY_7",
    0x00000033: "OVRDCAP_AMD64_CPU_FAMILY_8",
    0x00000034: "OVRDCAP_AMD64_CPU_FAMILY_9",
    0x00000035: "OVRDCAP_AMD64_CPU_FAMILY_10",
    0x00000036: "OVRDCAP_AMD64_CPU_FAMILY_11",
    0x00000037: "OVRDCAP_AMD64_CPU_FAMILY_12",
    0x00000038: "OVRDCAP_AMD64_CPU_FAMILY_13",
    0x00000039: "OVRDCAP_AMD64_CPU_FAMILY_14",
    0x0000003A: "OVRDCAP_AMD64_CPU_FAMILY_15",
    0x0000003B: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_0",
    0x0000003C: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_1",
    0x0000003D: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_2",
    0x0000003E: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_3",
    0x0000003F: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_4",
    0x00000040: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_5",
    0x00000041: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_6",
    0x00000042: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_7",
    0x00000043: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_8",
    0x00000044: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_9",
    0x00000045: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_10",
    0x00000046: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_11",
    0x00000047: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_12",
    0x00000048: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_13",
    0x00000049: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_14",
    0x0000004A: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_15",
    0x0000004B: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_16",
    0x0000004C: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_17",
    0x0000004D: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_18",
    0x0000004E: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_19",
    0x0000004F: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_20",
    0x00000050: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_21",
    0x00000051: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_22",
    0x00000052: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_23",
    0x00000053: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_24",
    0x00000054: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_25",
    0x00000055: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_26",
    0x00000056: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_27",
    0x00000057: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_28",
    0x00000058: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_29",
    0x00000059: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_30",
    0x0000005A: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_31",
    0x0000005B: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_32",
    0x0000005C: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_33",
    0x0000005D: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_34",
    0x0000005E: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_35",
    0x0000005F: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_36",
    0x00000060: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_37",
    0x00000061: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_38",
    0x00000062: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_39",
    0x00000063: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_40",
    0x00000064: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_41",
    0x00000065: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_42",
    0x00000066: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_43",
    0x00000067: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_44",
    0x00000068: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_45",
    0x00000069: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_46",
    0x0000006A: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_47",
    0x0000006B: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_48",
    0x0000006C: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_49",
    0x0000006D: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_50",
    0x0000006E: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_51",
    0x0000006F: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_52",
    0x00000070: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_53",
    0x00000071: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_54",
    0x00000072: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_55",
    0x00000073: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_56",
    0x00000074: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_57",
    0x00000075: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_58",
    0x00000076: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_59",
    0x00000077: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_60",
    0x00000078: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_61",
    0x00000079: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_62",
    0x0000007A: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_63",
    0x0000007B: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_64",
    0x0000007C: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_65",
    0x0000007D: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_66",
    0x0000007E: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_67",
    0x0000007F: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_68",
    0x00000080: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_69",
    0x00000081: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_70",
    0x00000082: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_71",
    0x00000083: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_72",
    0x00000084: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_73",
    0x00000085: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_74",
    0x00000086: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_75",
    0x00000087: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_76",
    0x00000088: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_77",
    0x00000089: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_78",
    0x0000008A: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_79",
    0x0000008B: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_80",
    0x0000008C: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_81",
    0x0000008D: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_82",
    0x0000008E: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_83",
    0x0000008F: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_84",
    0x00000090: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_85",
    0x00000091: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_86",
    0x00000092: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_87",
    0x00000093: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_88",
    0x00000094: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_89",
    0x00000095: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_90",
    0x00000096: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_91",
    0x00000097: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_92",
    0x00000098: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_93",
    0x00000099: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_94",
    0x0000009A: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_95",
    0x0000009B: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_96",
    0x0000009C: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_97",
    0x0000009D: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_98",
    0x0000009E: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_99",
    0x0000009F: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_100",
    0x000000A0: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_101",
    0x000000A1: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_102",
    0x000000A2: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_103",
    0x000000A3: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_104",
    0x000000A4: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_105",
    0x000000A5: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_106",
    0x000000A6: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_107",
    0x000000A7: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_108",
    0x000000A8: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_109",
    0x000000A9: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_110",
    0x000000AA: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_111",
    0x000000AB: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_112",
    0x000000AC: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_113",
    0x000000AD: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_114",
    0x000000AE: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_115",
    0x000000AF: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_116",
    0x000000B0: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_117",
    0x000000B1: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_118",
    0x000000B2: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_119",
    0x000000B3: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_120",
    0x000000B4: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_121",
    0x000000B5: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_122",
    0x000000B6: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_123",
    0x000000B7: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_124",
    0x000000B8: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_125",
    0x000000B9: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_126",
    0x000000BA: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_127",
    0x000000BB: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_128",
    0x000000BC: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_129",
    0x000000BD: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_130",
    0x000000BE: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_131",
    0x000000BF: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_132",
    0x000000C0: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_133",
    0x000000C1: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_134",
    0x000000C2: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_135",
    0x000000C3: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_136",
    0x000000C4: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_137",
    0x000000C5: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_138",
    0x000000C6: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_139",
    0x000000C7: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_140",
    0x000000C8: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_141",
    0x000000C9: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_142",
    0x000000CA: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_143",
    0x000000CB: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_144",
    0x000000CC: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_145",
    0x000000CD: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_146",
    0x000000CE: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_147",
    0x000000CF: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_148",
    0x000000D0: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_149",
    0x000000D1: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_150",
    0x000000D2: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_151",
    0x000000D3: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_152",
    0x000000D4: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_153",
    0x000000D5: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_154",
    0x000000D6: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_155",
    0x000000D7: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_156",
    0x000000D8: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_157",
    0x000000D9: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_158",
    0x000000DA: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_159",
    0x000000DB: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_160",
    0x000000DC: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_161",
    0x000000DD: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_162",
    0x000000DE: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_163",
    0x000000DF: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_164",
    0x000000E0: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_165",
    0x000000E1: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_166",
    0x000000E2: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_167",
    0x000000E3: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_168",
    0x000000E4: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_169",
    0x000000E5: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_170",
    0x000000E6: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_171",
    0x000000E7: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_172",
    0x000000E8: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_173",
    0x000000E9: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_174",
    0x000000EA: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_175",
    0x000000EB: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_176",
    0x000000EC: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_177",
    0x000000ED: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_178",
    0x000000EE: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_179",
    0x000000EF: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_180",
    0x000000F0: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_181",
    0x000000F1: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_182",
    0x000000F2: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_183",
    0x000000F3: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_184",
    0x000000F4: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_185",
    0x000000F5: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_186",
    0x000000F6: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_187",
    0x000000F7: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_188",
    0x000000F8: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_189",
    0x000000F9: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_190",
    0x000000FA: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_191",
    0x000000FB: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_192",
    0x000000FC: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_193",
    0x000000FD: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_194",
    0x000000FE: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_195",
    0x000000FF: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_196",
    0x00000100: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_197",
    0x00000101: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_198",
    0x00000102: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_199",
    0x00000103: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_200",
    0x00000104: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_201",
    0x00000105: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_202",
    0x00000106: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_203",
    0x00000107: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_204",
    0x00000108: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_205",
    0x00000109: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_206",
    0x0000010A: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_207",
    0x0000010B: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_208",
    0x0000010C: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_209",
    0x0000010D: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_210",
    0x0000010E: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_211",
    0x0000010F: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_212",
    0x00000110: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_213",
    0x00000111: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_214",
    0x00000112: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_215",
    0x00000113: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_216",
    0x00000114: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_217",
    0x00000115: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_218",
    0x00000116: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_219",
    0x00000117: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_220",
    0x00000118: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_221",
    0x00000119: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_222",
    0x0000011A: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_223",
    0x0000011B: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_224",
    0x0000011C: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_225",
    0x0000011D: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_226",
    0x0000011E: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_227",
    0x0000011F: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_228",
    0x00000120: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_229",
    0x00000121: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_230",
    0x00000122: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_231",
    0x00000123: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_232",
    0x00000124: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_233",
    0x00000125: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_234",
    0x00000126: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_235",
    0x00000127: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_236",
    0x00000128: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_237",
    0x00000129: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_238",
    0x0000012A: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_239",
    0x0000012B: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_240",
    0x0000012C: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_241",
    0x0000012D: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_242",
    0x0000012E: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_243",
    0x0000012F: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_244",
    0x00000130: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_245",
    0x00000131: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_246",
    0x00000132: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_247",
    0x00000133: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_248",
    0x00000134: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_249",
    0x00000135: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_250",
    0x00000136: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_251",
    0x00000137: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_252",
    0x00000138: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_253",
    0x00000139: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_254",
    0x0000013A: "OVRDCAP_AMD64_CPU_EXTENDED_FAMILY_255",
    0x0000013B: "OVRDCAP_AMD64_V1_CAPSET",
    0x0000013C: "OVRDCAP_AMD64_AVX",
    0x0000013D: "OVRDCAP_AMD64_AVX2",
    0x0000013E: "OVRDCAP_AMD64_AVX512F",
    0x0000013F: "OVRDCAP_AMD64_V2_CAPSET",
    0x00000140: "OVRDCAP_AMD64_V3_CAPSET",
    0x00000141: "OVRDCAP_AMD64_CFG_CHECK_OPT",
    0x00000142: "OVRDCAP_AMD64_CFG_DISPATCH_OPT",
    0x00000143: "OVRDCAP_AMD64_XFG_DISPATCH_OPT",
    0x00000144: "OVRDCAP_AMD64_POPCNT",
    0x00000145: "OVRDCAP_AMD64_MAX",
    0x00010000: "OVRDCAP_ARM64_FIRST",
    0x00010001: "OVRDCAP_ARM64_USERMODE",
    0x00010002: "OVRDCAP_ARM64_KERNELMODE",
    0x00010003: "OVRDCAP_ARM64_V1_CAPSET",
    0x00010004: "OVRDCAP_ARM64_SHA256",
    0x00010005: "OVRDCAP_ARM64_SHA512",
    0x00010006: "OVRDCAP_ARM64_SHA3",
    0x00010007: "OVRDCAP_ARM64_LSE",
    0x00010008: "OVRDCAP_ARM64_LSE2",
    0x00010009: "OVRDCAP_ARM64_RDM",
    0x0001000A: "OVRDCAP_ARM64_SM3",
    0x0001000B: "OVRDCAP_ARM64_SM4",
    0x0001000C: "OVRDCAP_ARM64_DP",
    0x0001000D: "OVRDCAP_ARM64_FHM",
    0x0001000E: "OVRDCAP_ARM64_FLAGM",
    0x0001000F: "OVRDCAP_ARM64_FLAGM2",
    0x00010010: "OVRDCAP_ARM64_FCMA",
    0x00010011: "OVRDCAP_ARM64_LRCPC",
    0x00010012: "OVRDCAP_ARM64_LRCPC2",
    0x00010013: "OVRDCAP_ARM64_BF16",
    0x00010014: "OVRDCAP_ARM64_I8MM",
    0x00010015: "OVRDCAP_ARM64_FP16",
    0x00010016: "OVRDCAP_ARM64_SVE",
    0x00010017: "OVRDCAP_ARM64_SVE2",
    0x00010018: "OVRDCAP_ARM64_F32MM",
    0x00010019: "OVRDCAP_ARM64_F64MM",
    0x0001001A: "OVRDCAP_ARM64_V2_CAPSET",
    0x0001001B: "OVRDCAP_ARM64_CFG_CHECK_OPT",
    0x0001001C: "OVRDCAP_ARM64_CFG_DISPATCH_OPT",
    0x0001001D: "OVRDCAP_ARM64_MAX",
    0x7FFFFFFF: "OVRDCAP_ALWAYS_OFF",
}


class PeSectionHeaderExt {
    get SectionName() {
        return host.memory.readString(this.Name.address, 8);
    }

    get SectionCharacteristics() {
        return BitmaskToString(this.Characteristics, SectionCharacteristicsFlags);
    }

    toString() { return this.SectionName; }
}


class BddDynamicRelocation {
    constructor(Address) {
        this.Raw = new host.createTypedObject(Address, "combase", `_IMAGE_BDD_DYNAMIC_RELOCATION`);
        this.Address = Address;
        this.IsLeaf = (this.Raw.Right.compareTo(this.Raw.Left) == 0);
        this.IsFinalLeaf = this.IsLeaf && (this.Raw.Right.compareTo(0) == 0);
    }

    toString() { return `BddDynamicRelocation[${this.Raw.Left}, ${this.Raw.Right}, ${this.Raw.Value}]`; }

    toHuman() {
        if (this.IsFinalLeaf)
            return `No override`;

        if (this.IsLeaf)
            return `goto Index:${this.Raw.Value}`;

        return `Supports(${BddCapabilityEnum[this.Raw.Value]}) ? jump ${hex(this.Raw.Right)} : jump ${hex(this.Raw.Left)}`;
    }
}


class BddInfoEntry {
    constructor(Address, Entry, BaseAddress) {
        this.Raw = new host.createTypedObject(Address, "combase", `_IMAGE_BDD_INFO`);
        this.Address = Address;
        this.BaseAddress = BaseAddress;
        this.Entry = Entry;
        this.Branches = [];
        let off = i64(0);
        while (off.compareTo(this.Raw.BDDSize) < 0) {
            const addr = this.Address.add(8).add(off);
            this.Branches.push(new BddDynamicRelocation(addr));
            off = off.add(8);
        }
    }

    toString() { return `BddInfoEntry`; }

    get DecisionTree() {
        let b = [];
        for (const branch of this.Branches) {
            let msg = branch.toHuman();
            if (branch.IsLeaf && !branch.IsFinalLeaf) {
                const rva = this.Entry.OverridingRVAs[branch.Raw.Value];
                const va = this.BaseAddress.add(rva);
                const sym = GetSymbolFromAddress(va);
                msg += `, RVA=${rva}`;
                msg += ` -> VA ${va} (${sym})`
            }
            b.push(msg);
        }
        return b;
    }
}


class DynamicRelocationFunctionOverrideEntry {
    constructor(Address, BaseAddress) {
        this.Raw = new host.createTypedObject(Address, "combase", `_IMAGE_FUNCTION_OVERRIDE_DYNAMIC_RELOCATION`);
        this.__Address = Address;
        this.__ImageBase = BaseAddress;
    }

    toString() { return `DynamicRelocationFunctionOverrideEntry`; }

    get Address() { return this.__Address; }

    get OriginalRVA() {
        return this.Raw.OriginalRva;
    }

    get OriginalVA() {
        return GetSymbolFromAddress(this.__ImageBase.add(this.OriginalRVA));
    }

    get OverridingRVAs() {
        let rvas = [];
        const RvaBase = this.Address.add(sizeof("combase", "_IMAGE_FUNCTION_OVERRIDE_DYNAMIC_RELOCATION"));
        for (let i = 0; i < this.Raw.RvaSize; i += 4) {
            const addr = RvaBase.add(i);
            rvas.push(i64(u32(addr)));
        }
        return rvas;
    }

    get OverridingVAs() {
        let rvas = [];
        for (const rva of this.OverridingRVAs) {
            const va = this.__ImageBase.add(rva);
            rvas.push(`${GetSymbolFromAddress(va)}`);
        }
        return rvas;
    }

    get BaseRelocs() {
        let relocs = [];
        let off = i64(0);
        const RelocationAddressArrayBase = this.Address.add(16).add(this.Raw.RvaSize);
        while (off.compareTo(this.Raw.BaseRelocSize) < 0) {
            const addr = RelocationAddressArrayBase.add(off);
            let entry = {
                "Header": new host.createTypedObject(addr, "combase", `_IMAGE_BASE_RELOCATION`),
                "Data": u32(addr.add(8)),
            };
            relocs.push(entry);
            off = off.add(entry["Header"].SizeOfBlock);
        }
        return relocs;
    }

    get Size() {
        return i64(0).add(0x10).add(this.Raw.RvaSize).add(this.Raw.BaseRelocSize);
    }
}


class DynamicRelocationFunctionOverride {
    constructor(Address, BaseAddress) {
        this.Raw = new host.createTypedObject(Address, "combase", `_IMAGE_FUNCTION_OVERRIDE_HEADER`);
        this.Address = Address;
        this.BaseAddress = BaseAddress;
        this.__Entries = [];
        this.__BddInfo = [];
        let off = i64(4);
        while (off.compareTo(this.Raw.FuncOverrideSize) < 0) {
            const entry = new DynamicRelocationFunctionOverrideEntry(this.Address.add(off), this.BaseAddress);
            this.__Entries.push(entry);
            off = off.add(entry.Size);
        }
        const BddTableAddr = this.Address.add(off);
        for (let i = 0; i < this.__Entries.length; i++) {
            const entry = this.__Entries[i];
            const addr = BddTableAddr.add(entry.Raw.BDDOffset);
            this.__BddInfo.push(new BddInfoEntry(addr, entry, this.BaseAddress));
        }
    }

    *[Symbol.iterator]() {
        for (let i = 0; i < this.__Entries.length; i++) {
            yield {
                "Entry": this.__Entries[i],
                "BDDInfo": this.__BddInfo[i],
            }
        }
    }

    toString() { return `DynamicRelocationFunctionOverride`; }

    get Size() { return this.Raw.Size; }
}


class DynamicRelocationTableEntry {
    constructor(Address, BaseAddress) {
        this.Raw = new host.createTypedObject(Address, "combase", `_IMAGE_DYNAMIC_RELOCATION64`);
        this.Address = Address;
        this.BaseAddress = BaseAddress;
        this.__Symbol = parseInt(this.Raw.Symbol);
    }

    get Name() { return DynamicRelocationSymbolNames[this.__Symbol]; }

    toString() { return `${this.Name} (${this.__Symbol})`; }

    *[Symbol.iterator]() {
        let i = 0;
        let off = i64(sizeof("combase", "_IMAGE_DYNAMIC_RELOCATION64"));
        while (off.compareTo(this.Raw.BaseRelocSize) < 0) {
            if (this.__Symbol == 7) {
                let entry = new DynamicRelocationFunctionOverride(this.Address.add(off), this.BaseAddress);
                yield new host.indexedValue(entry, [i]);
                off = off.add(entry.Size);
            }
            else {
                break;
            }
            i += 1;
        }
    }
}


class DynamicRelocationTable {
    constructor(Parent, Va) {
        this.__parent = Parent;
        this.Raw = new host.createTypedObject(Va, "combase", "_IMAGE_DYNAMIC_RELOCATION_TABLE");
    }

    *[Symbol.iterator]() {
        let i = 0;
        let off = sizeof("combase", "_IMAGE_DYNAMIC_RELOCATION_TABLE");
        while (off < this.Raw.Size) {
            let entry = new DynamicRelocationTableEntry(this.Raw.address.add(off), this.__parent.BaseAddress);
            yield new host.indexedValue(entry, [i]);
            off = off.add(4).add(4).add(entry.Raw.BaseRelocSize);
            i += 1;
        }
    }

    getDimensionality() { return 1; }

    toString() { return `DynamicRelocationTable`; };
}


class ImageInfo {
    constructor(Module) {
        this.__isKd = cursession().Attributes.Target.IsKernelTarget === true;
        this.__symMod = this.__isKd ? "nt" : "ntdll";
        this.__Module = Module
        this.BaseAddress = Module.BaseAddress;
        this.RawDos = host.createTypedObject(this.BaseAddress, this.__symMod, "_IMAGE_DOS_HEADER");
        this.RawPe = IsX64()
            ? host.createTypedObject(this.BaseAddress.add(this.RawDos.e_lfanew), this.__symMod, "_IMAGE_NT_HEADERS64")
            : host.createTypedObject(this.BaseAddress.add(this.RawDos.e_lfanew), this.__symMod, "_IMAGE_NT_HEADERS32");
    }

    toString() { return `ImageInfo(${hex(this.BaseAddress)})`; }

    get FileHeader() {
        var dos = this.RawDos || host.createTypedObject(this.address, this.__symMod, "_IMAGE_DOS_HEADER");
        var pe = this.RawPe || host.createTypedObject(this.address.add(dos.e_lfanew), this.__symMod, "_IMAGE_NT_HEADERS64");
        return pe.FileHeader;
    }

    get OptionalHeader() {
        var dos = this.RawDos || host.createTypedObject(this.address, this.__symMod, "_IMAGE_DOS_HEADER");
        var pe = this.RawPe || host.createTypedObject(this.address.add(dos.e_lfanew), this.__symMod, "_IMAGE_NT_HEADERS64");
        return pe.OptionalHeader;
    }

    get FileHeaderExt() {
        return {
            "__Name": "File Header information",
            "TimeStamp": new Date(this.FileHeader.TimeDateStamp),
            "Machine": FileHeaderFileMachineFlags[this.FileHeader.Machine] || this.FileHeader.Machine,
            "Characteristics": BitmaskToString(this.FileHeader.Characteristics, FileHeaderCharacteristicsFlags),
        };
    }

    get OptionalHeaderExt() {
        return {
            "__Name": "Optional Header information",
            "SubSystem": OptionalHeaderSubsystemFlags[this.OptionalHeader.Subsystem] || this.OptionalHeader.Subsystem,
            "DllCharacteristics":
                BitmaskToString(this.OptionalHeader.DllCharacteristics, OptionalHeaderDllCharacteristicsFlags),
        };
    }

    get Directories() {
        class ImageDirectory {
            constructor(DataDirectory, idx, ImageBase) {
                this.Raw = DataDirectory[idx];
                this.Name = OptionalHeaderDirectoryNames[idx];
                this.RVA = this.Raw.VirtualAddress;
                this.VA = ImageBase.add(this.RVA);
                this.Size = this.Raw.Size;
            }

            toString() { return `${this.Name}`; }
        };
        let dirs = [];
        if (!this.__isKd) {
            for (let i = 0; i < 16; i++) {
                let e = new ImageDirectory(this.OptionalHeader.DataDirectory, i, this.OptionalHeader.ImageBase);
                switch (i) {
                    // TODO: missing symbols in KD
                    case 0: e["Entry"] = new host.createTypedObject(e.VA, "combase", `_IMAGE_EXPORT_DIRECTORY`); break;
                    case 2: e["Entry"] = new host.createTypedObject(e.VA, "combase", `_IMAGE_RESOURCE_DIRECTORY`); break;
                    case 6: e["Entry"] = new host.createTypedObject(e.VA, "combase", `_IMAGE_DEBUG_DIRECTORY`); break;
                    case 10: e["Entry"] = new host.createTypedObject(e.VA, "combase", `_IMAGE_LOAD_CONFIG_DIRECTORY64`); break;
                }
                dirs.push(e);
            }
        }
        return dirs;
    }

    get Sections() {
        if (this.__isKd)
            return null;
        let addr = this.OptionalHeader.address.add(this.FileHeader.SizeOfOptionalHeader);
        let nb = this.FileHeader.NumberOfSections;
        return createTypedObject(addr, `combase!_IMAGE_SECTION_HEADER[${nb}]`);
    }

    get LoadConfig() {
        if (this.__isKd)
            return [];

        const dirEntry = this.Directories[10].Entry;
        let configItems = [];

        // TODO SEH
        { }

        // TODO CFG
        { }

        // DVRT
        {
            if (dirEntry.DynamicValueRelocTableSection.compareTo(0) > 0) {
                const section = this.Sections.Raw[dirEntry.DynamicValueRelocTableSection - 1];
                const dvrtVa = this.OptionalHeader.ImageBase.add(section.VirtualAddress).add(dirEntry.DynamicValueRelocTableOffset);
                const item = new DynamicRelocationTable(this, dvrtVa);
                configItems.push(item);
            }
        }

        return configItems;
    }
}


class ModuleEntry {
    constructor(Entry) {
        this.Entry = Entry;
        this.Image = new ImageInfo(this);
    }

    toString() { return `${this.Name}`; }

    get Name() { return this.Entry.BaseDllName.Buffer.ToDisplayString("sub"); }

    get Path() {
        try {
            // [KD] Could be paged-out: return empty on error
            return this.Entry.FullDllName.Buffer.ToDisplayString("sub");
        } catch (e) {
            return `memory access to ${hex(this.Entry.BaseDllName.Buffer.address)} failed`;
        }
    }

    get BaseAddress() { return this.Entry.DllBase.address; }
}


class GenericModuleIterator {
    constructor(ListHead, TypeName) {
        this.__ListHead = ListHead;
        this.__TypeName = TypeName;
    }

    Iterator() {
        return host.namespace.Debugger.Utility.Collections.FromListEntry(
            this.__ListHead,
            this.__TypeName,
            "InLoadOrderLinks"
        );
    }

    *[Symbol.iterator]() {
        for (let mod of this.Iterator()) {
            try {
                let e = new ModuleEntry(mod);
                yield e;
            } catch (x) {
                // mem access failed, might be paged-out?
                warn(`failed to access ${mod.address}`);
            }
        }
    }

    toString() {
        throw new Error(); // must be overridden by subclass
    }
}


class ProcessImageIterator extends GenericModuleIterator {
    constructor(process) {
        let ListHead = process.Environment.EnvironmentBlock.Ldr.InLoadOrderModuleList;
        super(ListHead, "ntdll!_LDR_DATA_TABLE_ENTRY");
    }

    toString() {
        return "ProcessImageIterator";
    }
}


class SystemImageIterator extends GenericModuleIterator {
    constructor() {
        if (cursession().Attributes.Target.IsKernelTarget === false)
            throw new Error("KD only");

        let PsLoadedModuleHead = host.createPointerObject(
            host.getModuleSymbolAddress("nt", "PsLoadedModuleList"),
            "nt",
            "_LDR_DATA_TABLE_ENTRY *"
        );
        let ListHead = PsLoadedModuleHead.InLoadOrderLinks;
        super(ListHead, "nt!_LDR_DATA_TABLE_ENTRY");
    }

    toString() {
        return "SystemImageIterator";
    }
}


class ProcessDlls {
    get Images() {
        return new ProcessImageIterator();
    }
}


class SessionModules {
    get Images() {
        return new SystemImageIterator();
    }
}


function initializeScript() {
    return [
        new host.apiVersionSupport(1, 9),

        //
        // Add new models
        //
        new host.namedModelParent(SessionModules, "Debugger.Models.Session"),
        new host.namedModelParent(ProcessDlls, "Debugger.Models.Process"),

        //
        // Add type extensions/registrations
        //
        new host.typeSignatureExtension(ImageInfo, "_IMAGE_DOS_HEADER"),
        // new host.typeSignatureRegistration(PeSectionHeaderExt, "_IMAGE_SECTION_HEADER"),
        // new host.typeSignatureExtension(DynamicRelocationTableExt, "_IMAGE_DYNAMIC_RELOCATION_TABLE"),
    ];
}

