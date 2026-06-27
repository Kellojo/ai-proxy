<script lang="ts">
  import { loadProviders } from "./providers-store";
  import { onMount } from "svelte";

  import { removeProvider } from "./providers-store";
  import type { Provider } from "./types";

  import CacheNotice from "./components/CacheNotice.svelte";
  import CreateProviderModal from "./components/CreateProviderModal.svelte";
  import EditProviderModal from "./components/EditProviderModal.svelte";
  import ProviderTable from "./components/ProviderTable.svelte";

  let showCreateModal = false;
  let showEditModal = false;
  let editingProvider: Provider = {} as Provider;

  onMount(() => {
    loadProviders();
  });

  function handleCreateProvider() {
    showCreateModal = true;
  }

  function handleCloseCreateModal() {
    showCreateModal = false;
  }

  function handleEditProvider(provider: Provider) {
    editingProvider = provider;
    showEditModal = true;
  }

  function handleCloseEditModal() {
    showEditModal = false;
    editingProvider = {} as Provider;
  }

  function handleDeleteProvider(id: string) {
    removeProvider(id);
  }
</script>

<main>
  <ProviderTable
    onCreateProvider={handleCreateProvider}
    onEditProvider={handleEditProvider}
    onDeleteProvider={handleDeleteProvider}
  />

  <CacheNotice />

  <CreateProviderModal show={showCreateModal} onClose={handleCloseCreateModal} />

  <EditProviderModal
    show={showEditModal}
    provider={editingProvider}
    onClose={handleCloseEditModal}
  />
</main>
