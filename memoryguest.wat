(module
  (memory (export "memory") 1)

  ;; Some long-lived pointers
  (global $SALUT_OFFSET i32 (i32.const 0))
  (global $NAME_OFFSET  i32 (i32.const 16))
  (global $MSG_OFFSET   i32 (i32.const 32))

  ;; ASCII characters
  (global $SPACE i32 (i32.const 32))
  (global $BANG  i32 (i32.const 33))
  (global $COMMA i32 (i32.const 44))

  (func (export "get_salutation_ptr") (result i32) (global.get $SALUT_OFFSET))
  (func (export "get_name_ptr")       (result i32) (global.get $NAME_OFFSET))
  (func (export "get_msg_ptr")        (result i32) (global.get $MSG_OFFSET))

  ;; - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  (func (export "set_name")
        (param $sal_len i32)
        (param $name_len i32)
        (result i32)

    ;; Declare a write pointer and set it to the start of the message area
    (local $msg_ptr i32)
    (local.set $msg_ptr (global.get $MSG_OFFSET))

    ;; Construct formatted message
    ;; Salutation
    (memory.copy (local.get $msg_ptr) (global.get $SALUT_OFFSET) (local.get $sal_len))
    (local.set $msg_ptr (i32.add (local.get $msg_ptr) (local.get $sal_len)))

    ;; Followed by a comma and a space
    (i32.store8 (local.get $msg_ptr) (global.get $COMMA))
    (local.set $msg_ptr (i32.add (local.get $msg_ptr) (i32.const 1)))

    (i32.store8 (local.get $msg_ptr) (global.get $SPACE))
    (local.set $msg_ptr (i32.add (local.get $msg_ptr) (i32.const 1)))

    ;; Name + bang
    (memory.copy (local.get $msg_ptr) (global.get $NAME_OFFSET) (local.get $name_len))
    (local.set $msg_ptr (i32.add (local.get $msg_ptr) (local.get $name_len)))

    (i32.store8 (local.get $msg_ptr) (global.get $BANG))

    ;; Return formatted message length = Salutation length + name length + 3
    (i32.add
      (i32.add (local.get $sal_len) (local.get $name_len))
      (i32.const 3)
    )
  )
)
