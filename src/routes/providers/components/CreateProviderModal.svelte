<script lang="ts">
    import ProviderForm from './ProviderForm.svelte';
    import { addProvider } from '../providers-store';
    import { createEmptyProviderForm, type ProviderForm as ProviderFormType } from '../types';
    import { onDestroy } from 'svelte';

    export let show: boolean;
    export let onClose: () => void;

    let dialog: HTMLDialogElement;
    let form: ProviderFormType = createEmptyProviderForm();

    function closeModal(): void {
        if (!dialog?.open) return;
        setTimeout(() => {
            form = createEmptyProviderForm();
            onClose();
            dialog.close();
        }, 140);
    }

    async function handleSave(): Promise<void> {
        await addProvider(form);
        closeModal();
    }

    $: if (show && dialog) setTimeout(() => dialog.showModal(), 5);

    onDestroy(() => {
        dialog?.close();
    });
</script>

<dialog bind:this={dialog} class="modal stack" aria-labelledby="create-provider-title">
    <div class="modal-header"><h2 id="create-provider-title">Create Provider</h2></div>

    <ProviderForm bind:formData={form} onFieldChange={() => {}} isEdit={false} />

    <div class="modal-footer">
        <button class="ghost" onclick={closeModal}>Close</button>
        <button onclick={handleSave}>Save Provider</button>
    </div>
</dialog>
