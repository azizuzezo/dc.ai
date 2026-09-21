/** Thin client for a self-hosted gopay-api-gateaway instance (https://github.com — see ../gopay-api-gateaway). */

async function gatewayFetch(baseUrl, path, params, apiKey) {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, { headers: { "X-Api-Key": apiKey } });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success === false) {
    throw new Error(`Gateway ${path} failed: ${body?.message || res.status}`);
  }
  return body;
}

/** Creates a dynamic QRIS for the given amount. Returns the gateway's `data` object (qris_id, trx_id, qris_code, amount, expires_at, ...). */
export async function createQris({ baseUrl, apiKey, amount }) {
  const body = await gatewayFetch(baseUrl, "/create-qris", { amount }, apiKey);
  return body.data;
}

/** Server-to-server verification. Returns { success, paid, transaction? }. */
export async function checkPayment({ baseUrl, apiKey, amount, trxId }) {
  return gatewayFetch(baseUrl, "/check-payment", { amount, trx_id: trxId }, apiKey);
}

export function qrisImageUrl(baseUrl, qrisId) {
  const url = new URL(`/qr/${qrisId}`, baseUrl);
  url.searchParams.set("format", "raw");
  return url.toString();
}
