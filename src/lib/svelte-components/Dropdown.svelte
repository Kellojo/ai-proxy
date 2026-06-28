<script module>
  let dropdownId = 0;
</script>

<script lang="ts">
  import Icon from "$lib/svelte-components/Icon.svelte";

  let {
    items = [],
  }: {
    items: Array<{
      label: string;
      variant?: "default" | "alt" | "danger";
      icon?: string;
      action: () => void;
    }>;
  } = $props();

  const uid = `dropdown-${++dropdownId}`;

  let menuEl: HTMLDivElement | null = null;
  let triggerEl: HTMLButtonElement | null = null;

  function onToggle() {
    if (!menuEl || !triggerEl) return;
    if (!menuEl.matches(":popover-open")) return;

    const rect = triggerEl.getBoundingClientRect();
    menuEl.style.left = `${rect.left}px`;
    menuEl.style.top = `${rect.bottom + 4}px`;

    requestAnimationFrame(() => {
      if (!menuEl) return;
      const menuRect = menuEl.getBoundingClientRect();
      if (menuRect.right > window.innerWidth) {
        menuEl.style.left = `${Math.max(4, window.innerWidth - menuRect.width - 4)}px`;
      }
    });
  }

  function handleItemClick(action: () => void) {
    menuEl?.hidePopover();
    action();
  }
</script>

<div class="dropdown">
  <button
    type="button"
    class="trigger"
    popovertarget={uid}
    popovertargetmode="toggle"
    aria-label="Actions"
    bind:this={triggerEl}
  >
    <Icon icon="tabler:dots-vertical" />
  </button>

  <div
    bind:this={menuEl}
    id={uid}
    popover="auto"
    class="menu"
    ontoggle={onToggle}
  >
    {#each items as item (item.label)}
      <button
        type="button"
        class="item {item.variant}"
        onclick={() => handleItemClick(item.action)}
      >
        {#if item.icon}
          <Icon icon={item.icon} />
        {/if}
        {item.label}
      </button>
    {/each}
  </div>
</div>

<style lang="css">
  .dropdown {
    position: relative;
    display: inline-block;
  }

  .trigger {
    font-family: inherit;
    padding: 0.35rem 0.45rem;
    border-radius: 0.5rem;
    cursor: pointer;
    background: color-mix(in srgb, var(--paper-soft) 60%, transparent);
    border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    color: var(--ink);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
      background-color 0.2s ease-in-out,
      border-color 0.2s ease-in-out;
  }

  .trigger:not(:disabled):hover {
    opacity: 1;
    filter: brightness(1.05);
    background-color: color-mix(in srgb, var(--paper-soft) 80%, transparent);
    border-color: color-mix(in srgb, var(--line) 90%, transparent);
  }

  .trigger:not(:disabled):active {
    transform: scale(0.95);
  }

  .menu:popover-open {
    position: fixed;
    z-index: 100;
    padding: 0;
    border-radius: 0.625rem;
    background-color: var(--background);
    -webkit-backdrop-filter: blur(1rem);
    backdrop-filter: blur(1rem);
    border: 1px solid color-mix(in srgb, var(--line) 30%, transparent);
    box-shadow: var(--shadow-m);
    display: flex;
    flex-direction: column;
    margin: 0;
    min-width: 180px;
    animation: menu-in 150ms ease-out;
  }

  @keyframes menu-in {
    from {
      opacity: 0;
      transform: translateY(4px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .item {
    font-family: inherit;
    text-align: left;
    padding: 0.75rem 1rem;
    border-radius: 0;
    cursor: pointer;
    background: none;
    border: none;
    color: var(--ink);
    transition:
      background-color 0.15s ease-in-out,
      transform 110ms ease-out;
    font-size: 0.875rem;
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: 0.75rem;
  }

  .item svg {
    width: 1em;
    height: 1em;
    flex-shrink: 0;
  }

  .item:hover {
    background-color: color-mix(in srgb, var(--ink) 8%, transparent);
  }

  .item:active {
    transform: scale(0.97);
  }

  .item.danger {
    color: #f87171;
  }

  .item.danger:hover {
    background-color: rgba(248, 113, 113, 0.12);
  }
</style>
