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

"use strict";

const log = x => host.diagnostics.debugLog(x + "\n");


/**
 * Roughtly copy/pasted from gef
 */
class CyclicPattern
{

    constructor(x)
    {
        this.length = 256;
    }


    Create(length, cycle = host.namespace.Debugger.State.PseudoRegisters.General.ptrsize)
    {
        //log("Pattern.Create(length="+length+", cycle="+cycle+")");
        var a = [];
        var charset = "abcdefghijklmnopqrstuvwxyz";
        var k = charset.length;
        var n = cycle;
        var res = [];

        this.length = length;

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


    __HexDecode(str1)
    {
        var hex = /*host.parseInt64(str1, 16);//*/ str1.toString(16);
        var a = [];
        for (var n = 0; n < hex.length; n += 2)
        {
            a.push( String.fromCharCode(parseInt(hex.substr(n, 2), 16)) );
        }
        return a.join('');
    }


    Search(pattern, length)
    {
        var decoded = this.__HexDecode(pattern);
        var sequence = this.Create(length);
        return sequence.indexOf(decoded);
    }


    toString()
    {
        return "Generate a de Bruijn cyclic sequence, and/or search through it";
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
