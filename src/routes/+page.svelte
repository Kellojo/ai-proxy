<script lang="ts">
  import { onMount, tick } from "svelte";
  let stats: any = null;
  let timelineCanvas: HTMLCanvasElement | null = null;
  let timelineChart: any = null;
  let ChartCtor: any = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let loadingStats = false;

  const LIVE_REFRESH_MS = 3000;
  const MAX_BUCKETS = 100;
  const BUCKET_MS = 5 * 60 * 1000;

  function formatTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  function statusTone(status: number) {
    if (status >= 500) return "error";
    if (status >= 400) return "warn";
    return "ok";
  }

  function displayModelName(value: string) {
    if (value === "__models__" || value === "models:list") return "Models List";
    return value;
  }

  function formatCompact(value: number) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
    return value.toLocaleString();
  }

  function formatTokens(value: unknown) {
    const amount = Number(value);
    return Number.isFinite(amount) ? formatCompact(amount) : "-";
  }

  function formatCost(value: unknown) {
    if (value == null) return "n/a";
    const amount = Number(value);
    return Number.isFinite(amount) ? `$${amount.toFixed(6)}` : "n/a";
  }

  function totalRequests() {
    if (stats?.summary?.request_count != null) {
      return Number(stats.summary.request_count) || 0;
    }

    if (!stats?.providerUsage?.length) return 0;
    return stats.providerUsage.reduce(
      (sum: number, row: { request_count: number }) =>
        sum + (row.request_count || 0),
      0,
    );
  }

  function totalTokens() {
    return Number(stats?.summary?.total_tokens || 0);
  }

  function totalCost() {
    return stats?.summary?.total_cost;
  }

  function activeProviders() {
    return stats?.providerUsage?.length || 0;
  }

  function activeModels() {
    return stats?.modelUsage?.length || 0;
  }

  function shortTimeLabel(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function toFiveMinuteBucket(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    date.setUTCSeconds(0, 0);
    date.setUTCMinutes(Math.floor(date.getUTCMinutes() / 5) * 5);
    return date.toISOString();
  }

  function chartRows() {
    const timeline = stats?.requestsTimeline;
    if (!Array.isArray(timeline) || timeline.length === 0) return [];

    const byBucket = new Map<
      string,
      { ok: number; warn: number; error: number; total: number }
    >();

    for (const item of timeline) {
      const bucket = toFiveMinuteBucket(String(item.hour_bucket || "unknown"));
      const status = Number(item.status_code || 0);
      const count = Number(item.request_count || 0);

      const row = byBucket.get(bucket) || {
        ok: 0,
        warn: 0,
        error: 0,
        total: 0,
      };
      if (status >= 500) row.error += count;
      else if (status >= 400) row.warn += count;
      else row.ok += count;
      row.total += count;
      byBucket.set(bucket, row);
    }

    const sorted = Array.from(byBucket.entries()).sort(
      (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime(),
    );

    if (sorted.length === 0) return [];

    const nowMs = Date.now();
    const bucketedNow = new Date(nowMs);
    bucketedNow.setUTCSeconds(0, 0);
    bucketedNow.setUTCMinutes(Math.floor(bucketedNow.getUTCMinutes() / 5) * 5);
    const endTs = bucketedNow.getTime();
    const startTs = endTs - MAX_BUCKETS * BUCKET_MS;

    const filled: Array<{
      bucket: string;
      label: string;
      ok: number;
      warn: number;
      error: number;
      total: number;
    }> = [];

    for (let ts = startTs; ts <= endTs; ts += BUCKET_MS) {
      const key = toFiveMinuteBucket(new Date(ts).toISOString());
      const data = byBucket.get(key) ?? { ok: 0, warn: 0, error: 0, total: 0 };
      filled.push({
        bucket: key,
        label: shortTimeLabel(key),
        ...data,
      });
    }

    return filled;
  }

  function readCssVar(name: string, fallback: string) {
    if (typeof window === "undefined") return fallback;
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return value || fallback;
  }

  async function ensureChartLib() {
    if (ChartCtor) return;
    const mod = await import("chart.js/auto");
    ChartCtor = mod.default;
  }

  async function renderTimelineChart() {
    if (!timelineCanvas) return;

    const points = chartRows();
    if (!points.length) {
      if (timelineChart) {
        timelineChart.destroy();
        timelineChart = null;
      }
      return;
    }

    await ensureChartLib();

    const labels = points.map((row) => row.label);
    const textMuted = readCssVar("--secondaryText", "#9ca3af");
    const textPrimary = readCssVar("--primaryText", "#f3f4f6");
    const gridColor = readCssVar("--borderColor", "rgba(255,255,255,0.1)");
    const success = readCssVar("--success", "#6dd67f");
    const warning = readCssVar("--warning", "#f5b342");
    const error = readCssVar("--error", "#ef6b6b");

    const datasets = [
      {
        label: "2xx/3xx",
        data: points.map((row) => row.ok),
        backgroundColor: success,
        borderWidth: 0,
        borderRadius: 3,
        borderSkipped: false,
        stack: "requests",
      },
      {
        label: "4xx",
        data: points.map((row) => row.warn),
        backgroundColor: warning,
        borderWidth: 0,
        borderRadius: 3,
        borderSkipped: false,
        stack: "requests",
      },
      {
        label: "5xx",
        data: points.map((row) => row.error),
        backgroundColor: error,
        borderWidth: 0,
        borderRadius: 3,
        borderSkipped: false,
        stack: "requests",
      },
    ];

    if (timelineChart) {
      timelineChart.data = { labels, datasets };
      timelineChart.update("none");
      return;
    }

    timelineChart = new ChartCtor(timelineCanvas, {
      type: "bar",
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: true,
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              color: textPrimary,
              usePointStyle: true,
              pointStyle: "rect",
            },
          },
          tooltip: {
            backgroundColor: "rgba(9, 13, 18, 0.95)",
            titleColor: "#ffffff",
            bodyColor: "#d1d5db",
          },
        },
        scales: {
          x: {
            stacked: true,
            maxBarThickness: 16,
            categoryPercentage: 0.3,
            ticks: {
              color: textMuted,
              autoSkip: true,
              maxTicksLimit: 10,
            },
            grid: {
              color: `${gridColor}66`,
            },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: {
              color: textMuted,
              precision: 0,
            },
            grid: {
              color: `${gridColor}66`,
            },
          },
        },
      },
    });
  }

  async function loadStats() {
    if (loadingStats) return;
    loadingStats = true;

    try {
      const statsRes = await fetch("/api/stats");
      if (!statsRes.ok) return;

      stats = await statsRes.json();
      await tick();
      await renderTimelineChart();
    } finally {
      loadingStats = false;
    }
  }

  onMount(() => {
    void loadStats();
    refreshTimer = setInterval(() => {
      void loadStats();
    }, LIVE_REFRESH_MS);

    return () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }

      if (timelineChart) {
        timelineChart.destroy();
        timelineChart = null;
      }
    };
  });
</script>

<main>
  <div class="stack" style="margin-bottom: 1rem;">
    <h1>Dashboard</h1>
  </div>

  <div class="grid">
    {#if !stats}
      <section class="card span-12 stack">
        <p class="muted">Loading...</p>
      </section>
    {:else}
      <section class="span-12 top-stats" aria-label="Summary statistics">
        <article class="card stack">
          <div class="muted">Total Requests</div>
          <div class="stat-value">{formatCompact(totalRequests())}</div>
        </article>
        <article class="card stack">
          <div class="muted">Total Tokens</div>
          <div class="stat-value">{formatTokens(totalTokens())}</div>
        </article>
        <article class="card stack">
          <div class="muted">Total Cost</div>
          <div class="stat-value">{formatCost(totalCost())}</div>
        </article>
        <article class="card stack">
          <div class="muted">Providers in Use</div>
          <div class="stat-value">{activeProviders()}</div>
        </article>
        <article class="card stack">
          <div class="muted">Models Seen</div>
          <div class="stat-value">{activeModels()}</div>
        </article>
      </section>
    {/if}

    <section class="card span-12 stack">
      <h2>Request Trends</h2>
      <p class="muted">5-minute request trend by status class.</p>

      {#if !chartRows().length}
        <p class="muted">No timeline data yet.</p>
      {:else}
        <div class="chart-panel">
          <canvas bind:this={timelineCanvas} class="timeline-chart"></canvas>
        </div>
      {/if}
    </section>

    <section class="card span-12 stack">
      <h2>Request Logs</h2>
      <p class="muted">Latest request history with status and latency.</p>

      {#if !stats?.recentRequests?.length}
        <p class="muted">No request logs yet.</p>
      {:else}
        <div class="table-wrap">
          <table class="logs-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Provider</th>
                <th>Model</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Tokens</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {#each stats.recentRequests as row}
                <tr>
                  <td>{formatTime(row.created_at)}</td>
                  <td>{row.provider_name}</td>
                  <td>{displayModelName(row.model)}</td>
                  <td>
                    <span class={`status-pill ${statusTone(row.status_code)}`}
                      >{row.status_code}</span
                    >
                  </td>
                  <td>{row.duration_ms} ms</td>
                  <td>{formatTokens(row.total_tokens)}</td>
                  <td>{formatCost(row.cost)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  </div>
</main>
