/**
 *
 * Basic example to show how to document a function directly via `dx`, and create a MASM-like function alias.
 *
 * Will show a greeting message upon init, or if called directly via
 *
 * 0:000> dx @$scripts.Greetings.Contents.greet("MyName")
 * or
 * 0:000> dx @$scriptContents.greet("MyName")
 *
 * or
 *
 * 0:000> !greet ""MyName"
 *
 * The documentation can be viewed with :
 *
 * 0:000> dx @$scriptContents.greet
 */

"use strict";

const log = x => host.diagnostics.debugLog(x + "\n");


/**
 * Be polite
 */
function greet(name)
{
    log("Greetings " + name + ", happy debugging!");
}
host.metadata.defineMetadata(this, { greet: { Help : "Say hello" } });


/**
 * Initialize the function alias.
 */
function initializeScript()
{
    return [
        new host.functionAlias(greet, "greet"),
    ];
}

