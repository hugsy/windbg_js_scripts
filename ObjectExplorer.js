/**
 *
 * Explore objects from nt!ObpRootDirectoryObject
 *
 */
"use strict";


const log = x => host.diagnostics.debugLog(x + "\n");
const getHeader = x => x.address.subtract(host.getModuleType("nt", "_OBJECT_HEADER").fields.Body.offset);
const getName = x  => host.createTypedObject(getHeader(x), "nt", "_OBJECT_HEADER").ObjectName
const getTypeName = x  => host.createTypedObject(getHeader(x), "nt", "_OBJECT_HEADER").ObjectType

var NativeTypes = {
    APLCPort: "nt!_KALPC_PORT",
};



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

        //
        // Get its type
        //
        this.Type = getTypeName(obj);


        //
        // Save the raw _OBJECT_HEADER (ugly af but works)
        //
        switch(this.Type)
        {
            case "Type":
                this.RawObjectHeader = host.createTypedObject(obj.address, "nt", "_OBJECT_TYPE");
                break;

            case "Event":
                this.RawObjectHeader = host.createTypedObject(obj.address, "nt", "_KEVENT");
                break;

            case "Driver":
                this.RawObjectHeader = host.createTypedObject(obj.address, "nt", "_DRIVER_OBJECT");
                break;

            case "Device":
                this.RawObjectHeader = host.createTypedObject(obj.address, "nt", "_DEVICE_OBJECT");
                break;

            case "ALPC Port":
                this.RawObjectHeader = host.createTypedObject(obj.address, "nt", "_ALPC_PORT");
                break;

            case "Section":
                this.RawObjectHeader = host.createTypedObject(obj.address, "nt", "_SECTION");
                break;

            case "SymbolicLink":
                this.RawObjectHeader = host.createTypedObject(obj.address, "nt", "_OBJECT_SYMBOLIC_LINK");
                break;

            //
            // todo : finish it
            //

            default:
                this.RawObjectHeader = obj;
                break;
        }


        //
        // Get its name. If it's paged out, don't bother splicing
        //
        this.Name = getName(this.RawObjectHeader);
        if (this.Name !== undefined)
            this.Name = this.Name.slice(1, -1);

    }

    /**
     *
     */
    toString()
    {
        let text = this.Parent.toString() + "\\" + this.Name;
        return text.replace("\\\\", "\\");
    }


    /**
     *
     */
    *DumpDirectory(ObjectDirectory)
    {
        //
        // Dump the 37 hash buckets
        //
        for (var bucketEntry of ObjectDirectory.HashBuckets)
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
                    if (chainEntry.ChainLink.isNull === true)
                    {
                        break;
                    }

                    chainEntry = chainEntry.ChainLink.dereference();
                }
            }
        }
    }
}


class WinObjDirectory extends WinObj
{
    /**
     * Directory WinObj objects
     */
    constructor(parent, obj)
    {
        super(parent, obj);
    }

    /**
     * Visit children nodes and store the objects in an array
     */
    *Walk()
    {
        var dirObject = host.createTypedObject(
            this.RawObjectHeader.address,
            "nt",
            "_OBJECT_DIRECTORY"
        );

        for (let Child of this.DumpDirectory(dirObject))
        {
            yield Child;
        }
    }

    get Children()
    {
        return this.Walk();
    }
}


class SessionModelParent
{
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

