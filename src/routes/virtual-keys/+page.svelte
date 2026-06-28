<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import Icon from "$lib/svelte-components/Icon.svelte";

  import Button from "$lib/svelte-components/Button.svelte";
  import Tag from "$lib/svelte-components/Tag.svelte";

  type VirtualKey = {
    id: string;
    name: string;
    keyPrefix: string;
    active: boolean;
    createdAt: string;
    lastUsedAt?: string;
  };

  let keys: VirtualKey[] = [];
  const DIALOG_ANIMATION_MS = 140;

  let keyName = "";
  let error = "";
  let showCreateModal = false;
  let createModalClosing = false;

  let createDialog: HTMLDialogElement | null = null;

  function formatTime(value?: string) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  async function loadKeys() {
    const response = await fetch("/api/virtual-keys");
    keys = (await response.json()).keys || [];
  }

  async function createVirtualKey() {
    error = "";

    const res = await fetch("/api/virtual-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: keyName }),
    });

    const payload = await res.json();
    if (!res.ok) {
      error = payload.error || "Failed to create key";
      return;
    }

    if (payload.plaintext) {
      try {
        await navigator.clipboard.writeText(payload.plaintext);
        toast.success("Key copied to clipboard");
      } catch {
        toast.error("Key created, but clipboard access failed");
      }
    }

    closeCreateModal();
    await loadKeys();
  }

  function openCreateModal() {
    createModalClosing = false;
    keyName = "";
    error = "";
    showCreateModal = true;
  }

  function closeCreateModal() {
    if (!showCreateModal || createModalClosing) return;
    createModalClosing = true;

    setTimeout(() => {
      showCreateModal = false;
      createModalClosing = false;
      keyName = "";
    }, DIALOG_ANIMATION_MS);
  }

  async function rerollKey(id: string) {
    const confirmed = window.confirm(
      "Reroll this key? The previous key value will stop working.",
    );
    if (!confirmed) return;

    const res = await fetch(`/api/virtual-keys/${id}/reroll`, {
      method: "POST",
    });
    const payload = await res.json();
    if (res.ok) {
      error = "";

      if (payload.plaintext) {
        try {
          await navigator.clipboard.writeText(payload.plaintext);
          toast.success("Rerolled key copied to clipboard");
        } catch {
          toast.error("Key rerolled, but clipboard access failed");
        }
      }

      await loadKeys();
    } else {
      error = payload.error || "Failed to reroll key";
    }
  }

  async function toggleKey(key: VirtualKey) {
    await fetch(`/api/virtual-keys/${key.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !key.active, name: key.name }),
    });
    await loadKeys();
  }

  async function renameKey(key: VirtualKey) {
    const nextName = window.prompt("New key name", key.name)?.trim();
    if (!nextName) return;

    await fetch(`/api/virtual-keys/${key.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nextName, active: key.active }),
    });

    await loadKeys();
  }

  async function deleteKey(id: string) {
    const confirmed = window.confirm(
      "Delete this key? This action cannot be undone.",
    );
    if (!confirmed) return;

    await fetch(`/api/virtual-keys/${id}`, { method: "DELETE" });
    await loadKeys();
  }

  $: {
    if (showCreateModal && createDialog && !createDialog.open) {
      createDialog.showModal();
    }

    if (!showCreateModal && createDialog?.open) {
      createDialog.close();
    }
  }

  onMount(loadKeys);
</script>

<main>
  <div class="stack" style="margin-bottom: 1rem;">
    <div class="page-header">
      <div class="stack" style="gap: 0.2rem;">
        <h1>Virtual Keys</h1>
        <p class="muted">
          Manage client-facing keys used to access proxy endpoints.
        </p>
      </div>
      <Button on:click={openCreateModal}>
        <Icon icon="tabler:plus" />
        New Key
      </Button>
    </div>
    {#if error}<div class="error">{error}</div>{/if}
  </div>

  {#if keys.length === 0}
    <p class="muted">No virtual keys yet.</p>
  {:else}
    <div class="table-wrap card">
      <table class="logs-table entity-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Prefix</th>
            <th>Status</th>
            <th>Last Used</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each keys as key}
            <tr>
              <td><strong>{key.name}</strong></td>
              <td>
                <span class="provider-endpoint">{key.keyPrefix}...</span>
              </td>
              <td>
                <Tag variant={key.active ? "ok" : "warn"}>
                  {key.active ? "Active" : "Disabled"}
                </Tag>
              </td>
              <td>{formatTime(key.lastUsedAt)}</td>
              <td>{formatTime(key.createdAt)}</td>
              <td>
                <div class="table-actions">
                  <Button variant="ghost" on:click={() => renameKey(key)}>
                    <Icon icon="tabler:pencil" /> Rename
                  </Button>
                  <Button variant="ghost" on:click={() => toggleKey(key)}>
                    {#if key.active}
                      <span>
                        <Icon icon="tabler:power" /> Disable
                      </span>
                    {:else}
                      <span>
                        <Icon icon="tabler:circle-check" /> Enable
                      </span>
                    {/if}
                  </Button>
                  <Button variant="alt" on:click={() => rerollKey(key.id)}>
                    <Icon icon="tabler:rotate" /> Reroll
                  </Button>
                  <Button variant="danger" on:click={() => deleteKey(key.id)}>
                    <Icon icon="tabler:trash-x" /> Delete
                  </Button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <dialog
    bind:this={createDialog}
    class={`modal stack ${createModalClosing ? "is-closing" : ""}`}
    aria-labelledby="create-key-title"
    on:cancel|preventDefault={closeCreateModal}
    on:click={(event) => {
      if (
        event.currentTarget === event.target &&
        document.activeElement !== event.currentTarget &&
        !event.currentTarget.contains(document.activeElement)
      )
        closeCreateModal();
    }}
  >
    <div class="modal-header">
      <h2 id="create-key-title">Create Key</h2>
    </div>

    <div class="row">
      <div style="flex: 1 1 260px;">
        <label for="key-name">Key Name</label>
        <input
          id="key-name"
          bind:value={keyName}
          placeholder="Production client"
        />
      </div>
    </div>

    <p class="muted">
      Use Authorization: Bearer vk_xxx when calling proxy endpoints.
    </p>

    <div class="row modal-footer">
      <Button variant="ghost" on:click={closeCreateModal}>
        <Icon icon="tabler:x" /> Close
      </Button>
      <Button on:click={(e) => { e.preventDefault(); createVirtualKey(); }}>
        <Icon icon="tabler:key" /> Create Key
      </Button>
    </div>
  </dialog>
</main>
