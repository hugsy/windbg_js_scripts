/// <reference path="../extra/JSProvider.d.ts" />
// "use strict";

/**
 *
 * Explore objects from nt!ObpRootDirectoryObject
 *
 * Some good resources:
 * - https://www.cs.fsu.edu/~zwang/files/cop4610/Fall2016/windows.pdf
 * - https://codemachine.com/articles/object_headers.html
 */


const log = x => host.diagnostics.debugLog(`${x}\n`);
const ok = x => log(`[+] ${x}`);
const warn = x => log(`[!] ${x}`);
const err = x => log(`[-] ${x}`);
const hex = x => x.toString(16);
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);

const TypeToStruct = {
    //
    // NT types
    //
    "Type": ["nt", "_OBJECT_TYPE"],
    "Event": ["nt", "_KEVENT"],
    "Driver": ["nt", "_DRIVER_OBJECT"],
    "Device": ["nt", "_DEVICE_OBJECT"],
    "ALPC Port": ["nt", "_ALPC_PORT"],
    "Section": ["nt", "_SECTION"],
    "SymbolicLink": ["nt", "_OBJECT_SYMBOLIC_LINK"],
    "Directory": ["nt", "_OBJECT_DIRECTORY"],
    "Thread": ["nt", "_ETHREAD"],
    "Process": ["nt", "_EPROCESS"],
    "Key": ["nt", "_CM_KEY_BODY"],
    "Job": ["nt", "_EJOB"],
    "Mutant": ["nt", "_KMUTANT"],
    "File": ["nt", "_FILE_OBJECT"],
    "Token": ["nt", "_TOKEN"],
    "Semaphore": ["nt", "_KSEMAPHORE"],
    "Adapter": ["nt", "_ADAPTER_OBJECT"],
    "Timer": ["nt", "_ETIMER"],
    "Partition": ["nt", "_EPARTITION"],
    "TmEn": ["nt", "_KTRANSACTION"],
    "TmRm": ["nt", "_KTRANSACTION"],
    "TmTm": ["nt", "_KTRANSACTION"],
    "TmTx": ["nt", "_KTRANSACTION"],

    //
    // Filter manager
    //
    "FilterConnectionPort": ["fltmgr", "_FLT_SERVER_PORT_OBJECT"],
    "FilterCommunicationPort": ["fltmgr", "_FLT_PORT_OBJECT"],


    //
    // Win32k
    //
    "Desktop": ["win32k", "tagDESKTOP"],
    "Callback": ["win32k", "_CALLBACKWND"],
    "WindowStation": ["win32k", "tagWINDOWSTATION"],

    /*
    "ActivationObject": ["nt", "_"],
    "ActivityReference": ["nt", "_"],
    "Composition": ["nt", "_"],
    "Controller": ["nt", "_"],
    "CoreMessaging": ["nt", "_"],
    "CoverageSampler": ["nt", "_"],
    "DebugObject": ["nt", "_"],
    "DmaAdapter": ["nt", "_"],
    "DxgkCompositionObject": ["nt", "_"],
    "DxgkDisplayManagerObject": ["nt", "_"],
    "DxgkSharedBundleObject": ["nt", "_"],
    "DxgkSharedKeyedMutexObject": ["nt", "_"],
    "DxgkSharedProtectedSessionObject": ["nt", "_"],
    "DxgkSharedResource": ["nt", "_"],
    "DxgkSharedSwapChainObject": ["nt", "_"],
    "DxgkSharedSyncObject": ["nt", "_"],
    "EnergyTracker": ["nt", "_"],
    "EtwConsumer": ["nt", "_"],
    "EtwRegistration": ["nt", "_"],
    "EtwSessionDemuxEntry": ["nt", "_"],
    "IoCompletion": ["nt", "_"],
    "IoCompletionReserve": ["nt", "_"],
    "IoRing": ["nt", "_"],
    "IRTimer": ["nt", "_"],
    "Key": ["nt", "_"],
    "KeyedEvent": ["nt", "_"],
    "NdisCmState": ["nt", "_"],
    "PcwObject": ["nt", "_"],
    "PowerRequest": ["nt", "_"],
    "ProcessStateChange": ["nt", "_"],
    "Profile": ["nt", "_"],
    "PsSiloContextNonPaged": ["nt", "_"],
    "PsSiloContextPaged": ["nt", "_"],
    "RawInputManager": ["nt", "_"],
    "RegistryTransaction": ["nt", "_"],
    "Session": ["nt", "_"],
    "SymbolicLink": ["nt", "_"],
    "ThreadStateChange": ["nt", "_"],
    "TpWorkerFactory": ["nt", "_"],
    "UserApcReserve": ["nt", "_"],
    "VRegConfigurationContext": ["nt", "_"],
    "WaitCompletionPacket": ["nt", "_"],
    "WmiGuid": ["nt", "_"],
    */
}

class WindowsVersion {
    constructor() {
        this.__Major = null;
        this.__Release = null;
    }

    __ResetValues() {
        // hack: usually follow the same format
        // - 7 : Windows 7 Kernel Version 7601 (Service Pack 1) MP (1 procs) Free x64
        // - 8.1 : Windows 8.1 Kernel Version 9600 MP (1 procs) Free x64
        // - 10 : Windows 10 Kernel Version 18362 MP (1 procs) Free x64
        // - 11 : Windows 10 Kernel Version 22000 MP (2 procs) Free x64
        let version_line = system("version")[0];
        this.__Major = version_line.match(/^Windows ([0-9\.]+) Kernel Version/)[1];
        this.__Release = version_line.match(/Kernel Version ([0-9\.]+) /)[1];
    }

    get Major() {
        if (this.__Major == null) {
            this.__ResetValues();
        }
        return this.__Major;
    }

    get Release() {
        if (this.__Release == null) {
            this.__ResetValues();
        }
        return this.__Release;
    }

    toString() {
        return `Windows ${this.Major} (Release: ${this.Release})`;
    }
}

//
// Because of this, strict mode has to be turned off
//
g_Version = new WindowsVersion();

function GetObjectHeaderAddress(ObjectAddress) {
    return ObjectAddress.subtract(host.getModuleType("nt", "_OBJECT_HEADER").fields.Body.offset);
}

function GetObjectBodyAddress(HeaderAddress) {
    return HeaderAddress.add(host.getModuleType("nt", "_OBJECT_HEADER").fields.Body.offset);
}

function GetTypeFromIndex(idx, typeAddr) {
    let ObTypeIndexTable = host.getModuleSymbol("nt", "ObTypeIndexTable", "_OBJECT_TYPE*[]");
    if (typeAddr != null) {
        //
        // This only exist for Win10/Win11, do the cookie dance
        //
        let ObHeaderCookie = host.getModuleSymbol("nt", "ObHeaderCookie", "unsigned char[]");
        let AddressByte = typeAddr.bitwiseShiftRight(8).bitwiseAnd(0xff);
        idx = ObHeaderCookie[0] ^ AddressByte ^ idx;
    }
    return ObTypeIndexTable[idx];
}

const OPTIONAL_HEADER_TYPE_CREATOR = 0;
const OPTIONAL_HEADER_TYPE_NAME = 1;
const OPTIONAL_HEADER_TYPE_HANDLE = 2;
const OPTIONAL_HEADER_TYPE_QUOTA = 3;
const OPTIONAL_HEADER_TYPE_PROCESS = 4;

class ObjectDirectoryEntry {
    /**
     * Create a new object entry
     */
    constructor(parent, objectDirectoryEntry) {
        let WindowsRelease = g_Version.Release;
        //
        // Set the current WinObj parent
        //
        this.Parent = parent;
        this.DirectoryEntry = objectDirectoryEntry; // nt!_OBJECT_DIRECTORY_ENTRY
        let ObjectAddress = objectDirectoryEntry.Object.address;
        let ObjectHeaderAddress = GetObjectHeaderAddress(ObjectAddress);
        this.ObjectHeader = host.createTypedObject(ObjectHeaderAddress, "nt", "_OBJECT_HEADER"); // nt!_OBJECT_HEADER
        this.ObjectType = GetTypeFromIndex(this.ObjectHeader.TypeIndex, (WindowsRelease >= 10000) ? ObjectHeaderAddress : null); // nt!_OBJECT_TYPE
        this.TypeName = this.ObjectType.Name.toString().slice(1, -1);
        this.OptionalHeaders = {};

        try {
            var StructObj = TypeToStruct[this.TypeName];
            this.NativeObject = host.createTypedObject(ObjectAddress, StructObj[0], StructObj[1]);
        }
        catch (e) {
            // warn(`Failed to create type '${this.TypeName} (${StructObj})': reason, ${e}`);
            this.NativeObject = ObjectAddress;
        }

        if (this.HasCreatorInfo) {
            let OptionalHeaderAddress = this.ObjectHeader.address.subtract(this.InfoMaskToOffset(OPTIONAL_HEADER_TYPE_CREATOR));
            this.OptionalHeaders[OPTIONAL_HEADER_TYPE_CREATOR] = host.createTypedObject(OptionalHeaderAddress, "nt", "_OBJECT_HEADER_CREATOR_INFO");
        }

        if (this.HasNameInfo) {
            let OptionalHeaderAddress = this.ObjectHeader.address.subtract(this.InfoMaskToOffset(OPTIONAL_HEADER_TYPE_NAME));
            this.OptionalHeaders[OPTIONAL_HEADER_TYPE_NAME] = host.createTypedObject(OptionalHeaderAddress, "nt", "_OBJECT_HEADER_NAME_INFO");
        }

        if (this.HasHandleInfo) {
            let OptionalHeaderAddress = this.ObjectHeader.address.subtract(this.InfoMaskToOffset(OPTIONAL_HEADER_TYPE_HANDLE));
            this.OptionalHeaders[OPTIONAL_HEADER_TYPE_HANDLE] = host.createTypedObject(OptionalHeaderAddress, "nt", "_OBJECT_HEADER_HANDLE_INFO");
        }

        if (this.HasQuotaInfo) {
            let OptionalHeaderAddress = this.ObjectHeader.address.subtract(this.InfoMaskToOffset(OPTIONAL_HEADER_TYPE_QUOTA));
            this.OptionalHeaders[OPTIONAL_HEADER_TYPE_QUOTA] = host.createTypedObject(OptionalHeaderAddress, "nt", "_OBJECT_HEADER_QUOTA_INFO");
        }

        if (this.HasProcessInfo) {
            let OptionalHeaderAddress = this.ObjectHeader.address.subtract(this.InfoMaskToOffset(OPTIONAL_HEADER_TYPE_PROCESS));
            this.OptionalHeaders[OPTIONAL_HEADER_TYPE_PROCESS] = host.createTypedObject(OptionalHeaderAddress, "nt", "_OBJECT_HEADER_PROCESS_INFO");
        }

        //
        // Specific cases
        //
        if (this.TypeName == "Directory") {
            this.Children = new ObjectDirectory(this.NativeObject, this.Path).Children;
        }

        if (this.TypeName == "SymbolicLink") {
            this.LinkTarget = this.NativeObject.LinkTarget.toString();
        }
    }

    get Name() {
        return this.HasNameInfo ? this.OptionalHeaders[OPTIONAL_HEADER_TYPE_NAME].Name.toString().slice(1, -1) : "";
    }

    get Path() {
        return `${this.Parent.Path}\\${this.Name}`.replace("\\\\", "\\");
    }

    get HasCreatorInfo() {
        return this.ObjectHeader.InfoMask.bitwiseAnd(1 << OPTIONAL_HEADER_TYPE_CREATOR) != 0;
    }

    get HasNameInfo() {
        return this.ObjectHeader.InfoMask.bitwiseAnd(1 << OPTIONAL_HEADER_TYPE_NAME) != 0;
    }

    get HasHandleInfo() {
        return this.ObjectHeader.InfoMask.bitwiseAnd(1 << OPTIONAL_HEADER_TYPE_HANDLE) != 0;
    }

    get HasQuotaInfo() {
        return this.ObjectHeader.InfoMask.bitwiseAnd(1 << OPTIONAL_HEADER_TYPE_QUOTA) != 0;
    }

    get HasProcessInfo() {
        return this.ObjectHeader.InfoMask.bitwiseAnd(1 << OPTIONAL_HEADER_TYPE_PROCESS) != 0;
    }

    InfoMaskToOffset(DesiredAccessBit) {
        let ObpInfoMaskToOffset = host.getModuleSymbol("nt", "ObpInfoMaskToOffset", "char[]");
        let DesiredAccess = 1 << DesiredAccessBit;
        let Index = this.ObjectHeader.InfoMask.bitwiseAnd(DesiredAccess | (DesiredAccess - 1));
        return ObpInfoMaskToOffset[Index];
    }

    /**
     *
     */
    toString() {
        try {
            let type = TypeToStruct[this.TypeName].join("!");
            return `${this.Path.padEnd(48)}[${type}]`;
        }
        catch (e) {
            return `${this.Path}`;
        }
    }

    /**
     * Help
     */
    get [Symbol.metadataDescriptor]() {
        return {
            Parent: { Help: "Pointer to the parent WinObj node.", },
            Name: { Help: "Name of the current node.", },
            TypeName: { Help: "Name of the current node type.", },
            ObjectType: { Help: "The type of the current node.", },
            ObjectHeader: { Help: "Pointer to the Windows Object header structure.", },
            NativeObject: { Help: "Pointer to the underlying object.", },
        };
    }
}


class ObjectDirectory {
    /**
     * Initialize new object directory
     *
     * See nt!_OBJECT_DIRECTORY
     */
    constructor(Object, Path = "") {
        this.Object = Object; // nt!_OBJECT_DIRECTORY
        this.Path = Path;
    }

    toString() {
        return this.Path;
    }

    /**
     * WinObjDirectory.Children getter
     */
    get Children() {
        return this.__Walk();
    }


    /**
     * Visit children nodes and store the objects in an array
     */
    *__Walk() {
        //
        // Dump the 37 hash buckets
        //
        for (var DirectoryEntryHead of this.Object.HashBuckets) {
            //
            // Skip if non-empty
            //
            if (DirectoryEntryHead.isNull) {
                continue;
            }

            //
            // Recurse through the chain of `nt!_OBJECT_DIRECTORY_ENTRY`
            //
            var curDirectoryEntry = DirectoryEntryHead;

            while (true) {
                //
                // Create the directory entry object
                //
                let Entry = new ObjectDirectoryEntry(this, curDirectoryEntry);
                yield Entry;

                //
                // Move to the next entry in the chain if any
                //
                let Next = Entry.DirectoryEntry.ChainLink;
                if (Next.isNull) {
                    break;
                }

                curDirectoryEntry = Next.dereference();
            }
        }
    }


    /**
     * Lookup a name in this object directory
     *
     * @param {String} childrenName Object name relative to this directory
     */
    LookupByName(childrenName) {
        var currentObject = this;

        for (var namePart of childrenName.split("\\")) {
            namePart = namePart.toLowerCase();

            var found = false;

            for (var children of currentObject.Children) {
                if (children.Name.toLowerCase() == namePart) {
                    found = true;
                    currentObject = children;
                    break;
                }
            }

            if (!found) {
                return null;
            }
        }

        return currentObject;
    }

    /**
     * Help
     */
    get [Symbol.metadataDescriptor]() {
        return {
            Parent: { Help: "Pointer to the parent WinObj node.", },
            Name: { Help: "Name of the current node.", },
            Type: { Help: "The type of the current node.", },
            ObjectHeader: { Help: "Pointer to the Windows Object header structure.", },
            Object: { Help: "Pointer to the native Windows structure.", },
            Children: { Help: "Enumerate all the children to this node.", }
        };
    }
}


class ObjectExplorerSessionModel {
    /**
     * Help
     */
    get [Symbol.metadataDescriptor]() {
        return {
            Objects: { Help: "Root of the Windows Named Object directory.", },
        };
    }

    /**
     * Root object getter
     */
    get Objects() {
        //
        // Use nt!ObpRootDirectoryObject for the directory root
        //
        var ObpRootDirectoryObject = host.getModuleSymbol("nt", "ObpRootDirectoryObject", "_OBJECT_DIRECTORY*");

        //
        // Dump from the root directory
        //
        return new ObjectDirectory(ObpRootDirectoryObject.dereference());
    }
}


/**
 *
 */
function initializeScript() {
    return [
        new host.apiVersionSupport(1, 3),
        new host.namedModelParent(ObjectExplorerSessionModel, 'Debugger.Models.Session'),
    ];
}

