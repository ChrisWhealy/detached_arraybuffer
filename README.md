# WebAssembly `memory.grow` and the "Detached `ArrayBuffer`" Problem

## Summary

* WebAssembly and its host environment can share a block of linear memory.
* This block of linear memory can be extended by calling the WebAssembly instruction [`memory.grow`](https://webassembly.github.io/spec/core/syntax/instructions.html#syntax-instr-memory).
* If JavaScript is the host environment, then shared memory is available as an `ArrayBuffer`.
* JavaScript cannot directly access the contents of an `ArrayBuffer`.
   Instead, it must use a structure such as a `Uint8Array` or a `Uint32Array` as an overlay or mask, then access the `ArrayBuffer` via the overlaid structure's semantics.
* JavaScript `ArrayBuffer`s are of fixed-length and cannot be extended.
* If WebAssembly memory grows, then the `ArrayBuffer` seen by JavaScript must be replaced with a larger one.
  This action immediately invalidates any JavaScript objects previously laid over top of the old `ArrayBuffer`

## What Consequences Do These Facts Create When Writing In Rust?

When writing a Rust program that you distribute as a WebAssembly module, certain actions in Rust ***might*** require more memory than is currently being shared between the two environments; in which case, memory growth will be performed automatically (and silently!)

When creating a WebAssembly module, `cargo` knows that memory growth might be required, so it builds the necessary coding into the WebAssembly module to call `memory.grow`.

If any functionality is then invoked[^1] that causes memory growth, the host environment still has access to shared memory, but it is a completely ***new*** block of memory.

After memory growth therefore, the pointers defining the start locations of all overlay objects become invalid (I.E. they are said to have become "detached") &mdash; the floor has literally been pulled out from underneath them...

If you attempt to access shared memory using a "pre-growth" object, you will see this error:

```
TypeError: Cannot perform %TypedArray%.prototype.slice on a detached ArrayBuffer
```

## Local Execution

Here is really simple demonstration of this problem.
In this trivial application, known locations in shared memory will be used to exchange data between a WebAssembly module and a JavaScript program.

### Generate the WebAssembly Module

Testing can be performed using different versions of the Wasm module:

1. A [working version](./memoryguest.wat) from source code written in WebAssembly Text

   To use this version, run `wat2wasm memoryguest.wat`
1. A [broken version](./src/lib_growth.rs) from source code written in Rust

   To use this version:

   * Rename `./src/lib_growth.rs` to `./src/lib.rs`
   * Run `cargo build --target=wasm32-unknown-unknown`
1. A [working version](./src/lib_no_growth.rs) from source code written in Rust

   To use this version:

   * Rename `./src/lib_no_growth.rs` to `./src/lib.rs`
   * Run `cargo build --target=wasm32-unknown-unknown`

### Run the JavaScript Tests

The tests are run as follows:

1. In both `server.js` and `client.js`, ensure that the variable `wasmFilePath` points to the particular Wasm module you wish to test
1. To test the Wasm module server side, run

   ```bash
   node server.js
   ```
1. To test the Wasm module in a browser

   * Start a temporary Web Server

      ```bash
      python3 -m http.server 8080
      ```
   * Point your browser to <http://localhost:8080>
   * Open the developer console

When the test succeeds, you will see

```
Ahoy there, Testy McTestface!
```

When the test fails, you will see Type Error shown above.

## Implementation

The memory map looks like this:

| Offset | Value | Discovered by calling Wasm function
|--:|---|---
| 0 | Salutation | `get_salutation_ptr`
| 16 | Name | `get_name_ptr`
| 32 | Formatted greeting | `get_msg_ptr`

Irrespective of the source language from which the Wasm module was generated, the JavaScript program must first obtain the values of the memory locations shown above, then it write the expected values to those locations.

Next, it calls the Wasm function `set_name` that combines the salutation and name, then writes the greeting to another known memory location.
`set_name` then returns the length of the formatted greeting.

Finally, the JavaScript program reads the greeting from shared memory and writes it to the console.

## But What Caused Memory Growth?

Look at the Rust coding in [./src/lib_growth.rs](./src/lib_growth.rs) from which the WebAssembly module is compiled.
Within function `set_name`, the `format!()` macro is used to assemble the result, which is then stored in an intermediate `String` called `greeting`.

Looks harmless enough...

```rust
#[no_mangle]
pub unsafe extern "C" fn set_name(sal_len: i32, name_len: i32) -> i32 {
    let sal: &str = str_from_buffer(SALUT_OFFSET, sal_len as usize);
    let name: &str = str_from_buffer(NAME_OFFSET, name_len as usize);

    let greeting: String = format!("{}, {}!", sal, name);
// snip...
```

However, the declaration of the new `String` requires more memory than has currently been allocated, so `cargo` has helpfully generated the necessary WebAssembly functionality to automatically issue the instruction `memory.grow`.

## Calling The Broken Code From JavaScript

Look at [./server.js](./server.js) to see the full context of this coding.

```javascript
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

console.log(msg_text)
```

So let's run this:

```bash
$ node server.js
/Users/chris/Developer/WebAssembly/detached_arraybuffer/server.js:60
    let msg_text = asciiArrayToString(mem8.slice(msg_ptr, msg_ptr + msg_len))
                                           ^

TypeError: Cannot perform %TypedArray%.prototype.slice on a detached ArrayBuffer
    at Uint8Array.slice (<anonymous>)
    at /Users/chris/Developer/WebAssembly/detached_arraybuffer/server.js:60:44
```

Since the call to the Wasm function `set_name` silently caused `memory.grow` to be called, the old `ArrayBuffer` over which the `Uint8Array` called `mem8` had been laid no longer exists.

# Two Solutions

We can take one of two possible approaches to solving this problem.
Either:

1. We make a mental note of the fact that calling `set_name` has this undesirable side-effect, and adjust the JavaScript code to work around the problem, or
1. We adjust the Rust coding so that when `set_name` is called, it does not silently call `memory.grow`

## 1. A JavaScript Workaround

A simple way to workaround this problem is to create a new version of the `mem8` array immediately after calling `set_name`.

However, this is just a workaround; it does not solve the underlying problem.
Anyone else calling the same WebAssembly module will need to implement the same workaround.

```javascript
// Snip...
let mem8 = new Uint8Array(wasmExports.memory.buffer)

// Snip...
let msg_len = wasmExports.set_name(salutation.length, name.length)
// Add this line in here
mem8 = new Uint8Array(wasmExports.memory.buffer)

let msg_text = asciiArrayToString(mem8.slice(msg_ptr, msg_ptr + msg_len))

console.log(msg_text)
```

Now everything works because the `mem8` array has been "reattached" to the new `ArrayBuffer`.

## 2. Solve the Problem in Rust

To actually solve the problem, the Rust coding needs to avoid invoking any instructions that would cause more memory to be allocated.

This means that instead of using an intermediate `String` object, we write the bytes of character string directly to the `[u8]` buffer.

The full solution can be seen in [./src/lib_no_growth.rs](./src/lib_no_growth.rs), but the relevant changes are shown below:

```rust
pub unsafe extern "C" fn set_name(sal_len: i32, name_len: i32) -> i32 {
    let mut idx: usize;

    // Write bytes of formatted string directly to buffer
    // Write salutation
    copy_bytes(MSG_OFFSET, SALUT_OFFSET, sal_len);
    idx = MSG_OFFSET + sal_len as usize;

    // Write separator ", "
    BUFFER[idx] = COMMA;
    idx += 1;
    BUFFER[idx] = SPACE;
    idx += 1;

    // Write name
    copy_bytes(idx, NAME_OFFSET, name_len);
    idx += name_len as usize;

    // Write bang character
    BUFFER[idx] = BANG;
    idx += 1;

    (idx - MSG_OFFSET) as i32
}
```

[^1]: This functionality could be invoked either from WebAssembly or the host environment
