/**
 * 
 * Very simple Hello World in WASM to be executed from inside the WASM VM of 
 * ChakraCore 
 * 
 * To invoke:
 * 
 * kd> .scriptrun \path\to\wasmoverwindbg.js
 * 
 */

"use strict";

const print = x => host.diagnostics.debugLog(x + "\n");
const system = x => host.namespace.Debugger.Utility.Control.ExecuteCommand(x);

var memory;


/**
 * Hello World in WASM bytecode, stored in a JS typed array
 */
function WasmToTypedArray()
{
  var raw = [
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 
	0x01, 0x09, 0x02, 0x60, 0x02, 0x7f, 0x7f, 0x00, 
	0x60, 0x00, 0x00, 0x02, 0x1d, 0x02, 0x06, 0x73, 
	0x74, 0x64, 0x6c, 0x69, 0x62, 0x05, 0x70, 0x72, 
	0x69, 0x6e, 0x74, 0x00, 0x00, 0x02, 0x6a, 0x73, 
	0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, 
	0x00, 0x14, 0x03, 0x02, 0x01, 0x01, 0x07, 0x08, 
	0x01, 0x04, 0x6d, 0x61, 0x69, 0x6e, 0x00, 0x01, 
	0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0x41,
    0x0b, 0x10, 0x00, 0x0b, 0x0b, 0x11, 0x01, 0x00, 
	0x41, 0x00, 0x0b, 0x0b, 0x48, 0x65, 0x6c, 0x6c, 
	0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64,
  ];
  return new Uint8Array(raw);
}
 

/**
 * Prints a string from the WASM memory located at the offset specified
 * 
 * @param {*} offset 
 * @param {*} length 
 */
function log(offset, length) 
{
	const bytes = new Uint8Array(memory.buffer, offset, length);
	const str = String.fromCharCode.apply(null, new Uint8Array(bytes));
	print(str);
}
 

/**
 * Instantiate the WASM module 
 * 
 * @param {*} typed_array 
 */
function LoadAndStartModule(typed_array)
{
  	memory = new WebAssembly.Memory({ initial : 20 });
  	const imports = {
   		stdlib: { print: log },
   		js: { memory: memory }
  	};
 	let mod = new WebAssembly.Module(typed_array);
	let insn = new WebAssembly.Instance(mod, imports);
  	return insn;
}
 

/**
 * JS WASM entrypoint
 */
function invokeScript()
{
	try 
	{
		var ta = WasmToTypedArray();
		var ins = LoadAndStartModule(ta);
		ins.exports.main();
	} 
	catch(e) 
	{
		print("[Exception]" + e);
	}
}
