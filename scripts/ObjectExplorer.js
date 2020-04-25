/// <reference path="JSProvider.d.ts" />
"use strict";

/**
 *
 * Explore objects from nt!ObpRootDirectoryObject
 *
 */


const log  = x => host.diagnostics.debugLog(`${x}\n`);
const ok   = x => log(`[+] ${x}`);
const warn = x => log(`[!] ${x}`);
const err  = x => log(`[-] ${x}`);

const getHeaderAddress = x => x.address.subtract(host.getModuleType("nt", "_OBJECT_HEADER").fields.Body.offset);
const getHeader = x => host.createTypedObject(getHeaderAddress(x), "nt", "_OBJECT_HEADER");
const getName = x  => getHeader(x).ObjectName;
const getTypeName = x  => getHeader(x).ObjectType;



class WinObj
{
    /**
     * Create a new WinObj object
     */
    constructor(parent, obj)
    {
        //
        // Set the current WinObj parent
        //
        this.Parent = (parent === null) ? "" : parent;
        this.ObjectHeader = getHeader(obj);
        this.Type = this.ObjectHeader.ObjectType;

        //
        // Create a typed object according to the object type
        //
        var TypeToStruct = {
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
            "Semaphore": ["nt", "_KSEMAPHORE"]
        }

        var StructObj = TypeToStruct[this.Type];

        if (StructObj != undefined)
        {
            this.Object = host.createTypedObject(obj.address, StructObj[0], StructObj[1]);
        }
        else
        {
            this.Object = obj;
        }

        //
        // Get its name. If it's paged out, don't bother splicing
        // The "ObjectName" member is an extension to the _OBJECT_HEADER structure implemented in kdexts.dll
        //
        this.Name = this.ObjectHeader.ObjectName;

        if (this.Name !== undefined)
        {
            this.Name = this.Name.slice(1, -1);
        }
    }


    /**
     *
     */
    toString()
    {
        let text = `${this.Parent.toString()}\\${this.Name}`;
        return text.replace("\\\\", "\\");
    }

    /**
     * Help
     */
    get [Symbol.metadataDescriptor]()
    {
        return {
            Parent: { Help: "Pointer to the parent WinObj node.", },
            Name: { Help: "Name of the current node.", },
            Type: { Help: "The type of the current node.", },
            ObjectHeader: { Help: "Pointer to the Windows Object header structure.", },
            Object: { Help: "Pointer to the native Windows structure.", },
        };
    }
}


class WinObjDirectory extends WinObj
{
    /**
     * Initialize new WinObjDirectory
     */
    constructor(parent, obj)
    {
        super(parent, obj);
    }

    /**
     * WinObjDirectory.Children getter
     */
    get Children()
    {
        return this.__WalkChildren();
    }



    /**
     * Visit children nodes and store the objects in an array
     */
    *__WalkChildren()
    {
        //
        // Dump the 37 hash buckets
        //
        for (var bucketEntry of this.Object.HashBuckets)
        {
            //
            // Only if non-empty
            //
            if ( !bucketEntry.isNull )
            {
                //
                // Get the first chain
                //
                var chainEntry = bucketEntry;

                while (true)
                {
                    //
                    // Create the object
                    //
                    if ( getTypeName( chainEntry.Object ) === "Directory" )
                    {
                        //
                        // Recursively call the generator on the sub-directory
                        //
                        yield new WinObjDirectory(this, chainEntry.Object);
                    }
                    else
                    {
                        yield new WinObj(this, chainEntry.Object);
                    }


                    //
                    // Move to the next entry in the chain
                    //
                    if (chainEntry.ChainLink.isNull)
                    {
                        break;
                    }

                    chainEntry = chainEntry.ChainLink.dereference();
                }
            }
        }
    }


    /**
     * Lookup a name in this object directory
     *
     * @param {String} childrenName Object name relative to this directory
     */
    LookupByName(childrenName)
    {
        var currentObject = this;

        for (var namePart of childrenName.split("\\"))
        {
            namePart = namePart.toLowerCase();

            var found = false;

            for (var children of currentObject.Children)
            {
                if (children.Name.toLowerCase() == namePart)
                {
                    found = true;
                    currentObject = children;
                    break;
                }
            }

            if (!found)
            {
                return null;
            }
        }

        return currentObject;
    }

    /**
     * Help
     */
    get [Symbol.metadataDescriptor]()
    {
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


class SessionModelParent
{
    /**
     * Help
     */
    get [Symbol.metadataDescriptor]()
    {
        return {
            Objects: { Help: "Root of the Windows Named Object directory.", },
        };
    }

    /**
     * Root object getter
     */
    get Objects()
    {
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
        return new WinObjDirectory(null, ObpRootDirectoryObject.dereference());
    }
}


/**
 *
 */
function initializeScript()
{
    //log("[+] Extending session model with `@$cursession.Objects`...");

    return [
        new host.namedModelParent(
            SessionModelParent,
            'Debugger.Models.Session'
        ),
        new host.apiVersionSupport(1, 3)
    ];
}

