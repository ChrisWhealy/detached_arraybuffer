# How to Avoid the "Detached `ArrayBuffer`" Problem After a Wasm Function Call

## TL;DR

* Memory allocated by a WebAssembly module can be shared with its host environment.
* If JavaScript is the host environment, it sees this memory as an `ArrayBuffer`.
* JavaScript can only access the contents of an `ArrayBuffer` through an overlaid structure such as a `Uint8Array`.
   > Under the surface, JavaScript then creates a pointer that anchors the `Uint8Array` to the correct location within the `ArrayBuffer` (usually the start).
* When writing Rust code that will be compiled to WebAssembly, certain actions in Rust *might* require more memory than is currently being shared between the two environments.

   If this is the case, then Rust will silently and automatically allocate a new block of memory.
* This has no effect on the `ArrayBuffer` seen by JavaScript; however, any JavaScript structure laid overtop of that `ArrayBuffer` will immediately become "detached" because its pointer is now invalid.
   You will then seen this error:
   ```
   TypeError: Cannot perform %TypedArray%.prototype.slice on a detached ArrayBuffer
   ```

## Demo Scenario

In this really simple exercise, shared memory will be used to exchange data between a WebAssembly module and a JavaScript program.

1. The JavaScript program obtains the value of some known locations in shared memory (I.E. long-lived pointers)
1. The JavaScript program then writes certain values to these locations.
1. The Wasm program formats these values and places the result at another known location
1. The JavaScript program then obtains the formated value by reading shared memory

| Offset | Expected Value | Discovered by calling Wasm function
|--:|---|---
| 0 | Salutation | `get_salutation_ptr`
| 16 | Name | `get_name_ptr`
| 32 | Formatted greeting | `get_msg_ptr`

In this example,  `Ahoy there` is written to memory offset 0 (the salutation) and `Testy MsTestface` is written to memory at offset 16 (the name)

Then the JavaScript program calls the Wasm function `set_name`.
This function combines the salutation and name into a greeting and returns the total length of that greeting.

The greeting is then read from shared memory at offset 32.

## The Cause of the Problem

Look at the Rust coding in [./src/lib_broken.rs](./src/lib_broken.rs) from which the WebAssembly module is compiled.
Within function `set_name` there is the apparently harmless declaration of a new `String` called `greeting` that is populated by calling the `format!()` macro.

```rust
#[no_mangle]
pub unsafe extern "C" fn set_name(sal_len: i32, name_len: i32) -> i32 {
    let sal: &str = str_from_buffer(SALUT_OFFSET, sal_len as usize);
    let name: &str = str_from_buffer(NAME_OFFSET, name_len as usize);

    let greeting: String = format!("{}, {}!", sal, name);
// snip...
```

Rust realises that in order to complete the declaration of the new `String`, it needs more memory.
So it silently and helpfully handles this implementation detail for you.
The bad news is that any overlaid structures in the host environment (such as `Uint8Array`s) have literally had the floor pulled out from underneath them, and are consequently unusable...

## JavaScript Coding

This snippet of code is part of [./server.js](./server.js) has available to it an object called `wasmExports` from which everying exported by the Wasm module is available.

```javascript
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
```

Everything looks fine here, except...

Due to the internal memory requirements of the Wasm function `set_name`, the `Uint8Array` called `mem8` suddenly becomes unusable...

```bash
$ node server.js
/Users/chris/Developer/WebAssembly/detached_arraybuffer/server.js:52
    let msg_text = asciiArrayToString(mem8.slice(msg_ptr, msg_ptr + msg_len))
                                           ^

TypeError: Cannot perform %TypedArray%.prototype.slice on a detached ArrayBuffer
    at Uint8Array.slice (<anonymous>)
    at /Users/chris/Developer/WebAssembly/detached_arraybuffer/server.js:52:44
```

# Two Solutions

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

Now everything works because the `mem8` array has been "reattached" to the underlying `ArrayBuffer`'s new location.

## 2. Solve the Problem in Rust

To actually solve the problem, the Rust coding needs to avoid invoking any instructions that would cause more memory to be allocated.

This means that the bytes of character string need to be written directly to the `[u8]` buffer, and not accumulated in an intermediate `String` object.

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

unsafe fn copy_bytes(to: usize, from: usize, len: i32) {
    BUFFER[from..(from + len as usize)]
        .iter()
        .enumerate()
        .for_each(|(idx, byte)| {
            BUFFER[to + idx] = *byte;
        })
}
```
