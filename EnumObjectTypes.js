/**
 *
 * Enumerate all objects in nt!ObpRootDirectoryObject
 *
 */
"use strict";


const log = x => host.diagnostics.debugLog(x + "\n");
const getHeader = x => x.address.subtract(host.getModuleType("nt", "_OBJECT_HEADER").fields.Body.offset);
const getName = x  => host.createTypedObject(getHeader(x), "nt", "_OBJECT_HEADER").ObjectName
const getTypeName = x  => host.createTypedObject(getHeader(x), "nt", "_OBJECT_HEADER").ObjectType

/**
 *
 */
function *DumpDirectory(objectDirectory, parentName)
{
    //
    // Create the full directory name
    //
    var rootName = parentName + "\\" + getName(objectDirectory).slice(1, -1);
    if (rootName === "\\\\") rootName = "";

    //
    // Dump the 37 hash buckets
    //
    for (var bucketEntry of objectDirectory.HashBuckets)
    {
        //
        // Only if non-empty
        //
        if (!bucketEntry.isNull)
        {
            //
            // Get the first chain
            //
            var chainEntry = bucketEntry;
            while (true)
            {   
                //
                // Get the object
                // 
                var obj = chainEntry.Object;

                //
                // Get its name. If it's paged out, don't bother splicing
                //
                var objName = getName(obj);
                if (objName !== undefined) objName = objName.slice(1, -1);

                //
                // Return the full path of the object
                //
                yield rootName + "\\" + objName;

                //
                // Get its type and check if it's a directory object
                //
                var objType = getTypeName(obj);
                if (objType === "Directory")
                {
                    //
                    // Recursively call the generator on the sub-directory
                    //
                    var dirObject = host.createTypedObject(obj.address,
                                                           "nt",
                                                           "_OBJECT_DIRECTORY");
                    yield *DumpDirectory(dirObject, rootName);
                }

                //
                // Move to the next entry in the chain
                //
                if (chainEntry.ChainLink.isNull === true) break;
                chainEntry = chainEntry.ChainLink.dereference();
            }
        }
    }
}

function EnumObjects()
{
    //
    // dx (_OBJECT_DIRECTORY*)&nt!ObpRootDirectoryObject
    //
    var testDir = host.getModuleSymbol("nt", 
                                       "ObpRootDirectoryObject",
                                       "_OBJECT_DIRECTORY*");

    //
    // Dump the root directory
    //
    return DumpDirectory(testDir, "");
}

/**
 *
 */
function initializeScript()
{
    log("[+] Creating the method `ObjectDump`...");
    return [new host.functionAlias(EnumObjects, "ObjectDump"),
            new host.apiVersionSupport(1, 3)];
}

