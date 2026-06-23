<script lang="ts">
    import ProviderForm from './ProviderForm.svelte';
    import { addProvider } from '../providers-store';
    import { createEmptyProviderForm, type ProviderForm as ProviderFormType } from '../types';

    export let show: boolean;
    export let onClose: () => void;

    let dialog: HTMLDialogElement;
    let form: ProviderFormType = createEmptyProviderForm();
    let modalClosing = false;

    const DIALOG_ANIMATION_MS = 140;

    function closeModal(): void {
        if (modalClosing || !show) return;
        modalClosing = true;
        setTimeout(() => {
            form = createEmptyProviderForm();
            onClose();
        }, DIALOG_ANIMATION_MS);
    }

    async function handleSave(): Promise<void> {
        await addProvider(form);
        closeModal();
    }

    $: if (show && dialog && !dialog.open) dialog.showModal();
    $: if (!show && dialog?.open) dialog.close();
</script>

<dialog
    bind:this={dialog}
    class="modal stack {modalClosing && 'is-closing'}"
    aria-labelledby="create-provider-title"
    oncancel={(e) => { e.preventDefault(); closeModal(); }}
    onclick={(e) => {
        if (e.currentTarget === e.target && (document.activeElement === dialog || !dialog.contains(document.activeElement))) {
            closeModal();
        }
    }}
>
    <div class="modal-header">
        <h2 id="create-provider-title">Create Provider</h2>
    </div>

    <ProviderForm
        bind:formData={form}
        onFieldChange={() => {}}
        isEdit={false}
    />

    <div class="modal-footer">
        <button class="ghost" onclick={closeModal}>Close</button>
        <button onclick={handleSave}>
            Save Provider
        </button>
    </div>
</dialog>
