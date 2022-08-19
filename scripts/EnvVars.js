/**
 *
 * Get the environment variables
 *
 * 0:000> .scriptload \path\to\EnvVars.js
 * 0:000> dx @$curprocess.Environment.Variables.Where( var => var.Name.Contains("SYMBOL") )
 * @$curprocess.Environment.Variables.Where( var => var.Name.Contains("SYMBOL") )
 *   [0x0]            : _NT_SYMBOL_PATH = srv*C:\Syms*http://msdl.microsoft.com/download/symbols
 *
 */

"use strict";

const log = x => host.diagnostics.debugLog(x + "\n");


class EnvironmentVariable {
    constructor(addr, name, value) {
        this.Address = addr
        this.Name = name;
        this.Value = value;
    }

    toString() {
        return `${this.Name} = ${this.Value}`;
    }
}


/**
 * Generator to inspect the PEB looking for the Environment variables from PEB
 */
function* GetEnvironmentVariables() {
    var Peb = host.namespace.Debugger.Sessions[0].Processes.First().Environment.EnvironmentBlock;
    var EnvVarBlockAddr = Peb.ProcessParameters.Environment.address;
    var off = 0;
    while (true) {
        var addr = EnvVarBlockAddr.add(off);
        var env = host.memory.readWideString(addr);
        if (env.length == 0) {
            break;
        }

        let Env = undefined;

        if (env.indexOf("=")) {
            let p = env.split("=");
            Env = new EnvironmentVariable(addr, p[0], p[1]);
        }
        else {
            Env = new EnvironmentVariable(addr, env, "");
        }

        if (Env !== undefined)
            yield (Env);

        off += (env.length + 1) * 2;
    }
}


class ModelParent {
    get Variables() {
        return GetEnvironmentVariables();
    }
}



/**
 * Initialize the function alias.
 */
function initializeScript() {
    return [
        new host.apiVersionSupport(1, 3),

        new host.namedModelParent(
            ModelParent,
            'Debugger.Models.Process.Environment'
        ),
    ];
}


