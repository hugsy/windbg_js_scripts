/// <reference path="../extra/JSProvider.d.ts" />
"use strict";

/**
 *
 * Explore objects from nt!ObpRootDirectoryObject
 *
 */


const log = x => host.diagnostics.debugLog(`${x}\n`);
const ok = x => log(`[+] ${x}`);
const warn = x => log(`[!] ${x}`);
const err = x => log(`[-] ${x}`);

const GetObjectHeaderAddress = x => x.address.subtract(host.getModuleType("nt", "_OBJECT_HEADER").fields.Body.offset);

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
    https://www.cs.fsu.edu/~zwang/files/cop4610/Fall2016/windows.pdf

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
    "Mutant": ["nt", "_"],
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


class RootObject {
    get Name() { return ""; }
    get Path() { return ""; }
}

class ObjectDirectoryEntry {
    /**
     * Create a new object entry
     *
     * See nt!_OBJECT_DIRECTORY_ENTRY
     */
    constructor(parent, obj, hashValue) {
        //
        // Set the current WinObj parent
        //
        this.Parent = parent;
        this.ObjectHeader = host.createTypedObject(GetObjectHeaderAddress(obj), "nt", "_OBJECT_HEADER");
        this.Type = this.ObjectHeader.ObjectType;
        this.__HashValue = hashValue;


        //
        // Create a typed object according to the object type
        //
        var StructObj = TypeToStruct[this.Type];

        if (StructObj !== undefined) {
            this.Object = host.createTypedObject(obj.address, StructObj[0], StructObj[1]);
        }
        else {
            this.Object = obj;
        }

        //
        // Get its name. If it's paged out, don't bother splicing
        // The "ObjectName" member is an extension to the _OBJECT_HEADER structure implemented in kdexts.dll
        //
        this.Name = this.ObjectHeader.ObjectName;

        if (this.Name !== undefined) {
            this.Name = this.Name.slice(1, -1);
        }
    }

    get Path() {
        return `${this.Parent.Path}\\${this.Name}`.replace("\\\\", "\\");
    }

    get HashValue() {
        return this.__HashValue;
    }

    /**
     *
     */
    toString() {
        try {
            let type = TypeToStruct[this.Type].join("!");
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
            Type: { Help: "The type of the current node.", },
            ObjectHeader: { Help: "Pointer to the Windows Object header structure.", },
            Object: { Help: "Pointer to the native Windows structure.", },
        };
    }
}


class ObjectDirectory extends ObjectDirectoryEntry {
    /**
     * Initialize new object directory
     *
     * See nt!_OBJECT_DIRECTORY
     */
    constructor(parent, obj) {
        super(parent, obj, undefined);
        this.RawObject = host.createTypedObject(obj.address, "nt", "_OBJECT_DIRECTORY");
    }


    /**
     * WinObjDirectory.Children getter
     */
    get Children() {
        return this.__WalkChildren();
    }


    /**
     * Visit children nodes and store the objects in an array
     */
    *__WalkChildren() {
        //
        // Dump the 37 hash buckets
        //
        for (var bucketEntry of this.RawObject.HashBuckets) {
            //
            // Only if non-empty
            //
            if (!bucketEntry.isNull) {
                //
                // Recurse through the chain of `nt!_OBJECT_DIRECTORY_ENTRY`
                //
                var chainEntry = bucketEntry;

                while (true) {
                    //
                    // Create the object
                    //
                    let ObjectAddress = GetObjectHeaderAddress(chainEntry.Object);
                    let TypedObject = host.createTypedObject(ObjectAddress, "nt", "_OBJECT_HEADER");

                    if (TypedObject.ObjectType === "Directory") {
                        //
                        // Recursively call the generator on the sub-directory
                        //
                        yield new ObjectDirectory(this, chainEntry.Object);
                    }
                    else {

                        yield new ObjectDirectoryEntry(this, chainEntry.Object, chainEntry.HashValue);
                    }


                    //
                    // Move to the next entry in the chain if any
                    //

                    let Next = chainEntry.ChainLink;
                    if (Next.isNull) {
                        break;
                    }

                    chainEntry = Next.dereference();
                }
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


class SessionModelParent {
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
        var ObpRootDirectoryObject = host.getModuleSymbol(
            "nt",
            "ObpRootDirectoryObject",
            "_OBJECT_DIRECTORY*"
        );

        //
        // Dump from the root directory
        //
        return new ObjectDirectory(new RootObject(), ObpRootDirectoryObject.dereference());
    }
}


/**
 *
 */
function initializeScript() {
    //log("[+] Extending session model with `@$cursession.Objects`...");

    return [
        new host.namedModelParent(
            SessionModelParent,
            'Debugger.Models.Session'
        ),
        new host.apiVersionSupport(1, 3)
    ];
}

