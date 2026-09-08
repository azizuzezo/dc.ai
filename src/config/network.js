import { Agent, setGlobalDispatcher, fetch as undiciFetch } from "undici";

/**
 * Forces every outbound fetch() in this process to resolve IPv4 only.
 *
 * This machine's IPv6 route is broken in a way that doesn't fail fast —
 * outbound IPv6 connection attempts hang for the full connect timeout
 * (~10s) instead of erroring immediately, before falling back to IPv4.
 * That single hang is enough to make gemini-web2api calls (and anything
 * else fetched from this process) time out and fail outright, even
 * though the target is reachable and healthy over IPv4. Confirmed via
 * `curl -4` during the Strix integration work — see ENGINEERING.md.
 *
 * Node's global fetch() is backed by its OWN internal, separately
 * bundled copy of undici (node:internal/deps/undici/undici) — calling
 * setGlobalDispatcher() from the "undici" npm package does NOT affect
 * it, only code that imports fetch from the npm package directly.
 * Confirmed by testing both side by side. So this also monkey-patches
 * globalThis.fetch to the npm package's fetch, which DOES honor the
 * dispatcher — every existing `fetch(...)` call site in this codebase
 * (geminiClient.js's default fetchImpl included) picks this up for free.
 */
export function forceIpv4Fetch() {
  setGlobalDispatcher(new Agent({ connect: { family: 4 } }));
  globalThis.fetch = undiciFetch;
}
