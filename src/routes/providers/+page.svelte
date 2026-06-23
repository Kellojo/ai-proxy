<script lang="ts">
  import { onMount } from "svelte";
  import { setupAutoRefresh, removeProvider, clearModelCache } from "./providers-store";
  import type { Provider } from "./types";

  import CacheNotice from "./components/CacheNotice.svelte";
  import CreateProviderModal from "./components/CreateProviderModal.svelte";
  import EditProviderModal from "./components/EditProviderModal.svelte";
  import ProviderTable from "./components/ProviderTable.svelte";

  let cleanupAutoRefresh: (() => void) | null = null;
  let showCreateModal = false;
  let showEditModal = false;
  let editingProvider: Provider = {} as Provider;

  onMount(() => {
    cleanupAutoRefresh = setupAutoRefresh();
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

  function handleClearCache() {
    clearModelCache();
  }
</script>

<main>
  <ProviderTable
    onCreateProvider={handleCreateProvider}
    onEditProvider={handleEditProvider}
    onDeleteProvider={handleDeleteProvider}
    onClearCache={handleClearCache}
  />

  <CacheNotice />

  <CreateProviderModal show={showCreateModal} onClose={handleCloseCreateModal} />

  <EditProviderModal
    show={showEditModal}
    provider={editingProvider}
    onClose={handleCloseEditModal}
  />
</main>
