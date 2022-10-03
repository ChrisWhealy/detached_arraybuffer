# Demonstrate Detached `ArrayBuffer` Problem After Wasm Function Call

Whilst learning about sharing memory between the Host environmemt and a WebAssembly guest module, I came across the following problem.

Tested using `cargo 1.64.0 (387270bc7 2022-09-16)` and the WebAssembly Binary Toolkit version 1.0.29

## TL;DR

* Memory declared in a WebAssembly module is exposed to JavaScript as an `ArrayBuffer`
* JavaScript can only access the contents of an `ArrayBuffer` through an overlay such as a `Uint8Array`
* Any structure laid overtop of an `ArrayBuffer` will become unusable if (for some reason) the underlying `ArrayBuffer` is moved to a different memory location.

It is suspected that some sort of memory move or reallocation is taking place here which, in turn, causes any overlaid structures to become detached, and thus unusable.

## Error Description

The Wasm module contains a function called `set_name` that formats a string in shared memory, then returns the length of that string.

* If the Wasm module is generated using `wat2wasm`, calling `set_name` works fine and has no impact on JavaScript
* If the Wasm module is generated using `cargo build --target=wasm32-unknown-unknown` or `wasm-pack build`, calling `set_name` also works fine, but afterwards, the `Uint8Array` through which JavaScript accesses the data is unusable because it has become detached from the underlying `ArrayBuffer`.
  This then causes the following error:
   
   ```
   TypeError: Cannot perform %TypedArray%.prototype.slice on a detached ArrayBuffer
   ```

This error appears to have been introduced by `cargo` as it is not specific to any particular JavaScript engine.
It occurs both on the server-side in NodeJS, and client side in Firefox, Safari and Brave.


## Local Execution


1. Python3 will be used to create a temporary Web Server
1. NodeJS will be used for server side testing
1. Install the [WebAssembly Binary Toolkit](https://github.com/WebAssembly/wabt) version 1.0.29
1. [Install Rust](https://www.rust-lang.org/tools/install)
1. Ensure that the `cargo` build target `wasm32-unknown-unknown` is installed

   ```bash
   rustup target add wasm32-unknown-unknown
   ```
1. Install [`wasm-pack`](https://rustwasm.github.io/wasm-pack/installer/)
1. Clone this repo

   ```bash
   git clone https://github.com/ChrisWhealy/detached_arraybuffer
   ```
1. Change into the repo directory

   ```bash
   cd detached_arraybuffer
   ```
1. Generate the `.wasm` module using `wat2wasm`.
   The functionality being compiled here has been written in raw WebAssembly text.

   ```bash
   wat2wasm memoryguest.wat
   ```
1. Build a second version of the Wasm module using `cargo`.
   The Rust module being compiled here implements the equivalent functionality through the same API as that found in the WebAssembly Text file.

   ```bash
   cargo build --target=wasm32-unknown-unknown
   ```
   
   The Wasm module will be written to the directory `./target/wasm32-unknown-unknown/debug/`
1. Build a third version of the Wasm module using `wasm-pack`

   ```bash
   wasm-pack build
   ```
   
   The Wasm module will be written to the directory `./pkg/`

### Server Side Testing

As delivered, the server side version will run successfully:

```bash
$ node server.js
Ahoy there, Testy McTestface!
```

Now, edit `server.js` and comment out line 4 and uncomment line 7

```javascript
const fs = require("fs")

// Wasm module built using wat2wasm
// const wasmFilePath = "./memoryguest.wasm"

// Wasm module built using cargo
const wasmFilePath = "./target/wasm32-unknown-unknown/debug/memoryguest.wasm"

// Wasm module built using wasm-pack
// const wasmFilePath = "./pkg/memoryguest_bg.wasm"
```

Rerun the test and you should get a `TypeError`

```bash
$ node server.js 
/Users/chris/Developer/WebAssembly/detached_arraybuffer/server.js:52
    let msg_text = asciiArrayToString(mem8.slice(msg_ptr, msg_ptr + msg_len))
                                           ^

TypeError: Cannot perform %TypedArray%.prototype.slice on a detached ArrayBuffer
    at Uint8Array.slice (<anonymous>)
    at /Users/chris/Developer/WebAssembly/detached_arraybuffer/server.js:52:44
```

Now comment out line 52 and uncomment lines 47 and 48 and rerun the test.
Now that a new `Uint9Array` is being overlayed onto the WebAssembly `ArrayBUffer`, the coding runs correctly.

### Client Side Testing

Start a Python webserver from this repo's top level directory:

```bash
python3 -m http.server 8080
```

Point your Browser to <http://localhost:8080> and open the developer tools.
Look at the console output.

```
  Ahoy there, Testy McTestface!                                            client.js:47
>
```

Edit `client.js`, then follow the same instructions as above for `server.js` and refresh your browser page.
