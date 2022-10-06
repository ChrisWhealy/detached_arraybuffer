const MEMORY_BUFFER_SIZE: usize = 128;
const SALUT_OFFSET: usize = 0;
const NAME_OFFSET: usize = 16;
const MSG_OFFSET: usize = 32;

const SPACE: u8 = 32;
const BANG: u8 = 33;
const COMMA: u8 = 44;

static mut BUFFER: [u8; MEMORY_BUFFER_SIZE] = [0; MEMORY_BUFFER_SIZE];

/// Return the long-lived pointers to known memory locations
#[no_mangle]
pub unsafe extern "C" fn get_salutation_ptr() -> *const u8 {
    get_ptr(SALUT_OFFSET)
}

#[no_mangle]
pub unsafe extern "C" fn get_name_ptr() -> *const u8 {
    get_ptr(NAME_OFFSET)
}

#[no_mangle]
pub unsafe extern "C" fn get_msg_ptr() -> *const u8 {
    get_ptr(MSG_OFFSET)
}

#[no_mangle]
/// Place the formatted greeting at the known memory location and return the total length
///
/// Don't use an intermediate String object to hold the formatted greeting as this might cause Wasm memory growth
pub unsafe extern "C" fn set_name(sal_len: i32, name_len: i32) -> i32 {
    let mut idx: usize;

    // Write salutation directly to the buffer
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

/// Helper functions
unsafe fn get_ptr(offset: usize) -> *const u8 {
    BUFFER.as_ptr().add(offset)
}

unsafe fn copy_bytes(to: usize, from: usize, len: i32) {
    BUFFER[from..(from + len as usize)]
        .iter()
        .enumerate()
        .for_each(|(idx, byte)| {
            BUFFER[to + idx] = *byte;
        })
}
