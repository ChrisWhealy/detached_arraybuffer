const fs = require("fs")

/***
 * Pick up the Wasm module built using wat2wasm
 * Since this module was hand-written directly in WebAssembly Text, it does not contain the functionality to reallocate
 * shared memory.
 *
 * The detached ArrayBuffer problem cannot happen when using this version of the module
 */
// const wasmFilePath = "./memoryguest.wasm"

/***
 * Pick up the Wasm module built using cargo
 * Since this module was written in Rust, the Rust compiler inserts extra functionality into the module that allows it
 * to adjust shared memory if necessary
 *
 * Therefore, the detached ArrayBuffer problem might happen when using this version of the module
 */
const wasmFilePath = "./target/wasm32-unknown-unknown/debug/memoryguest.wasm"

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Helpers for String <==> ASCII conversion
const stringToAsciiArray = str => [...str].map(c => c.charCodeAt())
const asciiArrayToString = ascArray => String.fromCharCode(...ascArray)

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Async function to instantiate whatever Wasm module is referenced by the constant wasmFilePath
const startWasm =
  async pathToWasmFile => {
    let wasmMod = await WebAssembly.instantiate(
      new Uint8Array(fs.readFileSync(pathToWasmFile)),
      {},
    )
    return wasmMod.instance.exports
  }

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Everything starts here
startWasm(wasmFilePath)
  .then(wasmExports => {
    const salutation = "Ahoy there"
    const name = "Testy McTestface"

    // Look at shared memory as an array of unsigned bytes
    const mem8 = new Uint8Array(wasmExports.memory.buffer)

    // Fetch long-lived pointers
    const sal_ptr = wasmExports.get_salutation_ptr()
    const name_ptr = wasmExports.get_name_ptr()
    const msg_ptr = wasmExports.get_msg_ptr()

    // Store salutation and name at the expected locations
    mem8.set(stringToAsciiArray(salutation), sal_ptr)
    mem8.set(stringToAsciiArray(name), name_ptr)

    // Tell Wasm to write the formatted greeting to the known memory location then return its length
    let msg_len = wasmExports.set_name(salutation.length, name.length)

    // Read greeting from shared memory
    let msg_text = asciiArrayToString(mem8.slice(msg_ptr, msg_ptr + msg_len))
    //                                ^^^^^^^^^^ mem8 will point to nothing after memory growth!

    console.log(msg_text)
  })
