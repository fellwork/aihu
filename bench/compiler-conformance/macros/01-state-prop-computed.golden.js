// @aihu:extract read=agents call=anonymous
// $prop label: String → const label = computed(() => ctx.attrs.label)
// $computed upper = expr → const upper = computed(() => label.toUpperCase())
//
// These are emitted via emit_state_macros() into the component setup body.
// The parser strips $-prefix lines and the emitter lowers them to signals.

// Expected lowerings (from emit_state_macros):
// const label = computed(() => ctx.attrs.label);
// const upper = computed(() => label.toUpperCase());
