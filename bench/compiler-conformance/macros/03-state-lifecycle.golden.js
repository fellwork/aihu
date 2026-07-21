// @aihu:extract read=agents call=anonymous
// $lifecycle.mount { body } → onMount(() => { body })
// $lifecycle.dispose { body } → onCleanup(() => { body })
// $action submit(data) { body } → function submit(data) { return batch(() => { body }) }
//
// Expected lowerings (from emit_state_macros):
// onMount(() => { initializeWidget() });
// onCleanup(() => { cleanup() });
// function submit(data) { return batch(() => { sendForm(data) }) }
