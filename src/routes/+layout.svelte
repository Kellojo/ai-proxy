<script lang="ts">
  import "../app.css";
  import "../toasts.css";
  import { Toaster } from "svelte-sonner";
  import Icon from "$lib/svelte-components/Icon.svelte";

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
      <a
        href="/"
        class:active={isActive("/")}
        title="Dashboard"
      >
        <Icon icon="tabler:layout-dashboard" />
        Dashboard
      </a>

      <a
        href="/providers"
        class:active={isActive("/providers")}
        title="Providers"
      >
        <Icon icon="tabler:globe" />
        Providers
      </a>
      <a
        href="/model-mappings"
        class:active={isActive("/model-mappings")}
        title="Model Mappings"
      >
        <Icon icon="tabler:shuffle" />
        Model Mappings
      </a>
      <a
        href="/virtual-keys"
        class:active={isActive("/virtual-keys")}
        title="Virtual Keys"
      >
        <Icon icon="tabler:key" />
        Virtual Keys
      </a>
      <a
        href="/docs"
        class:active={isActive("/docs")}
        title="Get Started"
      >
        <Icon icon="tabler:book" />
        Get Started
      </a>
    </nav>
  </div>
</header>

<slot />
<Toaster position="bottom-center" toastOptions={{ unstyled: true, class: "toast" }} />
