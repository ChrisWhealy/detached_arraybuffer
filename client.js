// Wasm module built using wat2wasm
const wasmFilePath = "./memoryguest.wasm"

// Wasm module built using cargo
// const wasmFilePath = "./target/wasm32-unknown-unknown/debug/memoryguest.wasm"

// Wasm module built using wasm-pack
// const wasmFilePath = "./pkg/memoryguest_bg.wasm"

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Helpers
const stringToAsciiArray = str => [...str].map(c => c.charCodeAt())
const asciiArrayToString = ascArray => String.fromCharCode(...ascArray)

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Async function to instantiate WASM module
const startWasm =
  async pathToWasmFile => {
    let wasmMod = await WebAssembly.instantiateStreaming(fetch(pathToWasmFile), {})
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

    // If the WASM module is built using cargo or wasm-pack, then the call to set_name causes the mem8 array to become
    // detached from the underlying ArrayBuffer and must therefore be redefined
    // let msg_bytes = wasmExports.memory.buffer.slice(msg_ptr, msg_ptr + msg_len)
    // let msg_text = asciiArrayToString(new Uint8Array(msg_bytes))

    // If the WASM module is built using wat2wasm, then the above workaround is not needed because the call to sat_name
    // does not detach the mem8 array from the underlying ArrayBuffer
    let msg_text = asciiArrayToString(mem8.slice(msg_ptr, msg_ptr + msg_len))

    console.log(msg_text)
  })
