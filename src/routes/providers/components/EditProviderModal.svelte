<script lang="ts">
  import ProviderForm from "./ProviderForm.svelte";
  import { saveProviderEdits } from "../providers-store";
  import type { ProviderForm as ProviderFormType, Provider } from "../types";
  import { createEmptyProviderForm } from "../types";

  export let show: boolean;
  export let provider: Provider;
  export let onClose: () => void;

  const DIALOG_ANIMATION_MS = 140;

  let dialog: HTMLDialogElement;
  let form: ProviderFormType = createEmptyProviderForm();
  let editingId: string;
  let modalClosing: boolean = false;

  function openModal(): void {
    editingId = provider.id;
    form = {
      name: provider.name,
      kind: provider.kind,
      endpointUrl: provider.endpointUrl,
      apiKey: "",
      isDefault: provider.isDefault,
    };
  }

  function closeModal(): void {
    if (modalClosing || !show) return;
    modalClosing = true;
    setTimeout(() => {
      form = createEmptyProviderForm();
      modalClosing = false;
      onClose();
    }, DIALOG_ANIMATION_MS);
  }

  async function handleSave(): Promise<void> {
    await saveProviderEdits(editingId, form);
    closeModal();
  }

  $: if (show) openModal();
  $: if (show && dialog && !dialog.open) dialog.showModal();
  $: if (!show && dialog?.open) dialog.close();
</script>

<dialog
  bind:this={dialog}
  class="modal stack {modalClosing && 'is-closing'}"
  aria-labelledby="edit-provider-title"
  oncancel={(e) => { e.preventDefault(); closeModal(); }}
  onclick={(event) => {
    if (event.currentTarget === event.target && (document.activeElement === dialog || !dialog.contains(document.activeElement))) {
      closeModal();
    }
  }}
>
  <div class="modal-header">
    <h2 id="edit-provider-title">Edit Provider</h2>
  </div>

  <ProviderForm bind:formData={form} onFieldChange={() => {}} isEdit={true} />

  <div class="modal-footer">
    <button class="ghost" onclick={closeModal}>Close</button>
    <button onclick={handleSave}>Save Changes</button>
  </div>
</dialog>
