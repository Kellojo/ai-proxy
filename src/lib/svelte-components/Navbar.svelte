<script lang="ts">
  interface BrandProps {
    text: string;
    href?: string;
  }

  type NavbarProps = {
    title?: string;
    brand?: BrandProps;
    version?: string;
  };

  const DEFAULTS = {
    title: "AI Proxy",
    brand: { text: "AI Proxy", href: "/" },
  };

  let {
    title = DEFAULTS.title,
    brand = DEFAULTS.brand,
    version,
  }: NavbarProps = $props();
</script>

<header class="topbar">
  <div class="topbar-inner">
    <div class="brand-row">
      <a class="brand" href={brand.href}>{title}</a>
      {#if version}<span class="version">v{version}</span>{/if}
    </div>
    <nav class="nav" aria-label="Primary navigation">
      <slot name="links" />
    </nav>
  </div>
</header>

<style lang="css">
  :global(.topbar) {
    position: sticky;
    top: 0;
    z-index: 20;
    backdrop-filter: blur(16px) saturate(130%);
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--paper) 28%, transparent) 0%,
        color-mix(in srgb, var(--paper-soft) 22%, transparent) 100%
      ),
      color-mix(in srgb, var(--bg) 48%, transparent);
    border-bottom: 1px solid
      color-mix(in srgb, var(--line) 72%, var(--glass-border));
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.12) inset,
      0 10px 24px rgba(0, 0, 0, 0.16);
  }

  :global(.topbar-inner) {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0.7rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  :global(.brand-row) {
    display: inline-flex;
    align-items: baseline;
    gap: 0.45rem;
  }

  :global(.brand) {
    font-family: "Varela Round", "Segoe UI", "Inter", sans-serif;
    font-weight: 700;
    color: var(--ink);
    text-decoration: none;
    letter-spacing: 0.01em;
  }

  :global(.version) {
    font-size: 0.78rem;
    color: var(--muted);
    letter-spacing: 0.01em;
  }

  :global(.nav) {
    display: flex;
    gap: 0.45rem;
    flex-wrap: wrap;
    margin-left: auto;
  }

  :global(.nav a) {
    display: flex;
    align-items: center;
    gap: 0.25rem;

    text-decoration: none;
    color: var(--muted);
    border: 1px solid color-mix(in srgb, var(--line) 65%, var(--glass-border));
    padding: 0.36rem 0.72rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--paper) 54%, transparent);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    transition: all 110ms ease-out;
  }

  :global(.nav a:hover) {
    border-color: var(--line);
    color: var(--ink);
  }

  :global(.nav a.active) {
    color: var(--ink);
    border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
    background: color-mix(in srgb, var(--accent) 24%, transparent);
  }

  @media (max-width: 680px) {
    :global(.topbar-inner) {
      flex-direction: column;
      align-items: flex-start;
    }

    :global(.nav) {
      width: 100%;
    }

    :global(.nav a) {
      flex: 1;
      text-align: center;
    }
  }
</style>
