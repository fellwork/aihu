// @aihu:extract read=agents call=anonymous
// $resource data = fetchUsers() → const data = createResource(() => fetchUsers())
// $effect { body } → effect(() => { body })
// $effect.on(data) { body } → effect(() => { data; body })
//
// Expected lowerings (from emit_state_macros):
// const data = createResource(() => fetchUsers());
// effect(() => { console.log(data()) });
// effect(() => { data; updateList(data()) });
