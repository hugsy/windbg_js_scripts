///
/// <reference path="JSProvider.d.ts" />
///
"use strict";

/**
 * Generate a de Bruijn cyclic sequence, and/or search through it
 *
 * Ported from
 * https://github.com/hugsy/gef/blob/aacafb1ac175ebf0845614859dd6228c16b6623e/gef.py#L3174
 *
 * Use:
 * 0:000> dx Debugger.Utility.CyclicPattern.Create(0x10)
 * Debugger.Utility.CyclicPattern.Create(256) : aaaaaaaabaaaaaaac
 *   Length           : 0x10
 *
 * 0:000> dx Debugger.Utility.CyclicPattern.Search("61616161616162", 256)
 * Debugger.Utility.CyclicPattern.Search("61616161616162", 256) : 0x2
 */
const log  = x => host.diagnostics.debugLog(`${x}\n`);
const ok   = x => log(`[+] ${x}`);
const warn = x => log(`[!] ${x}`);

var DEFAULT_LENGTH = 256;


/**
 * Roughly copy/pasted from gef
 */
class CyclicPattern
{

    constructor()
    {

    }


    static __Create(length, cycle = host.namespace.Debugger.State.PseudoRegisters.General.ptrsize)
    {
        var a = [];
        var charset = "abcdefghijklmnopqrstuvwxyz";
        var k = charset.length;
        var n = cycle;
        var res = [];

        DEFAULT_LENGTH = length;

        for (var i = 0; i < k * n; i++)
        {
            a.push(0);
        }

        function *DeBruijnSequence(t, p)
        {
            if (t > n)
            {
                if (n % p !== 0)
                    return;

                for (var j = 1; j <= p; j++)
                    yield charset[ a[j] ];

                return;
            }

            a[t] = a[t-p];

            for (let __a of DeBruijnSequence(t + 1, p))
                yield __a;

            for (var j = a[t-p] + 1; j < k; j++)
            {
                a[t] = j;
                for (let __a of DeBruijnSequence(t + 1, t))
                    yield __a;
            }
        }

        for(var c of DeBruijnSequence(1,1))
        {
            if(res.length === length)
                break;

            res.push(c);
        }

        return res.join('');
    };


    static __HexDecode(str1)
    {
        let hex = host.parseInt64(str1, 16).toString(16);
        let a = [];
        for (let n = 0; n < hex.length; n += 2)
            a.push( String.fromCharCode(parseInt(hex.substr(n, 2), 16)) );

        return a.join('');
    }


    static __GetPatternAsAddress(patt)
    {
        let pattern;

        if (typeof patt != 'string')
        {
            // if it's a number, represent it as a string
            pattern = patt.toString();
        }
        else
        {
            // if it's a string
            if(patt.startsWith("0x"))
            {
                // is it an hex address inside -> sanitize it
                pattern = patt.replace("`", "" );
            }
            else
            {
                // is it a symbol / register -> resolve it
                pattern = host.evaluateExpression(`${patt}`);
            }
        }
        return pattern;
    }


    Create(length, cycle = host.namespace.Debugger.State.PseudoRegisters.General.ptrsize)
    {
        return CyclicPattern.__Create(length, cycle);
    }


    Search(pattern, length = undefined)
    {
        if(length === undefined)
            length = DEFAULT_LENGTH;

        pattern = CyclicPattern.__GetPatternAsAddress(pattern);

        let decoded = CyclicPattern.__HexDecode(pattern);
        let sequence = CyclicPattern.__Create(length);

        let index = sequence.indexOf(decoded);
        if (index >=0 )
            ok(`Found pattern '${pattern}' at offset ${index}`);
        else
            warn(`Not found`);
    }


    toString()
    {
        return "Generate a de Bruijn cyclic sequence, and/or search through it";
    }


    get [Symbol.metadataDescriptor]()
    {
        return {
            Create:
            {
                PreferShow: true,
                Help: "Create(length[, cycle]) - Create a DeBruijn sequence of specified length."
            },

            Search: {
                PreferShow: true,
                Help: "Search(pattern[, length]) - Search a hexadecimal pattern inside a DeBruijn sequence"
          },
        };
    }

}


/**
 *
 */
function initializeScript() {
    return [
        new host.apiVersionSupport(1, 2),
        new host.namespacePropertyParent(
            CyclicPattern,
            "Debugger.Models.Utility",
            "Debugger.Models.Utility.CyclicPattern",
            "CyclicPattern"
            ),
        ];
}
