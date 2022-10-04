const fs = require("fs")

// Wasm module compiled from raw WebAssembly text using wat2wasm
// const wasmFilePath = "./memoryguest.wasm"

// Wasm module built using cargo
const wasmFilePath = "./target/wasm32-unknown-unknown/debug/memoryguest.wasm"

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Helpers
const stringToAsciiArray = str => [...str].map(c => c.charCodeAt())
const asciiArrayToString = ascArray => String.fromCharCode(...ascArray)

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Async function to instantiate WASM module
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

    const mem8 = new Uint8Array(wasmExports.memory.buffer)
    const sal_ptr = wasmExports.get_salutation_ptr()
    const name_ptr = wasmExports.get_name_ptr()
    const msg_ptr = wasmExports.get_msg_ptr()

    mem8.set(stringToAsciiArray(salutation), sal_ptr)
    mem8.set(stringToAsciiArray(name), name_ptr)

    let msg_len = wasmExports.set_name(salutation.length, name.length)
    let msg_text = asciiArrayToString(mem8.slice(msg_ptr, msg_ptr + msg_len))

    console.log(msg_text)
  })
