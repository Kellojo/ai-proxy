<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";

  function isActive(path: string) {
    if (path === "/") return page.url.pathname === "/";
    return page.url.pathname.startsWith(path);
  }
</script>

<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="/">AI Proxy</a>
    <nav class="nav" aria-label="Primary navigation">
      <a href="/" class:active={isActive("/")}>Dashboard</a>
      <a href="/docs" class:active={isActive("/docs")}>API Docs</a>
      <a href="/providers" class:active={isActive("/providers")}>Providers</a>
      <a href="/virtual-keys" class:active={isActive("/virtual-keys")}
        >Virtual Keys</a
      >
    </nav>
  </div>
</header>

<slot />
