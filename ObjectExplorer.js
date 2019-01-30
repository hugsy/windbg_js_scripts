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





class WinObj
{
    /**
     * Create a new WinObj object
     */
    constructor(parent, obj)
    {
        if (parent === null)
        {
            this.Parent = "";
        }
        else
        {
            this.Parent = parent;
        }

        //
        // Save the raw _OBJECT_HEADER
        //
        this.RawObjectHeader = obj;

        //
        // Get its name. If it's paged out, don't bother splicing
        //
        this.Name = getName(this.RawObjectHeader);
        if (this.Name !== undefined)
            this.Name = this.Name.slice(1, -1);

        //
        // Get its type
        //
        this.Type = getTypeName(this.RawObjectHeader);
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

