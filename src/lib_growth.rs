const MEMORY_BUFFER_SIZE: usize = 128;
const SALUT_OFFSET: usize = 0;
const NAME_OFFSET: usize = 16;
const MSG_OFFSET: usize = 32;

static mut BUFFER: [u8; MEMORY_BUFFER_SIZE] = [0; MEMORY_BUFFER_SIZE];

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
/// The use an intermediate String object to hold the formatted greeting inadvertently causes Wasm memory growth
pub unsafe extern "C" fn set_name(sal_len: i32, name_len: i32) -> i32 {
    let sal: &str = str_from_buffer(SALUT_OFFSET, sal_len as usize);
    let name: &str = str_from_buffer(NAME_OFFSET, name_len as usize);

    let greeting: String = format!("{}, {}!", sal, name);

    greeting
        .as_bytes()
        .iter()
        .enumerate()
        .for_each(|(idx, byte): (usize, &u8)| {
            BUFFER[MSG_OFFSET + idx] = *byte;
        });

    greeting.len() as i32
}

unsafe fn get_ptr(offset: usize) -> *const u8 {
    BUFFER.as_ptr().add(offset)
}

unsafe fn str_from_buffer(from: usize, len: usize) -> &'static str {
    std::str::from_utf8(&BUFFER[from..(from + len)]).unwrap()
}
