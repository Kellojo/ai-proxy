<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";

  function isActive(path: string) {
    if (path === "/") return page.url.pathname === "/";
    return page.url.pathname.startsWith(path);
  }

  // @ts-ignore
  const version = __VERSION__;
</script>

<header class="topbar">
  <div class="topbar-inner">
    <div class="brand-row">
      <a class="brand" href="/">AI Proxy</a>
      <span class="version">v{version}</span>
    </div>
    <nav class="nav" aria-label="Primary navigation">
      <a href="/" class:active={isActive("/")}>Dashboard</a>

      <a href="/providers" class:active={isActive("/providers")}>Providers</a>
      <a href="/virtual-keys" class:active={isActive("/virtual-keys")}
        >Virtual Keys</a
      >
      <a href="/docs" class:active={isActive("/docs")}>Get Started</a>
    </nav>
  </div>
</header>

<slot />
