import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createQris, checkPayment, qrisImageUrl } from "../src/services/gopayGateway.js";

async function withMockGateway(handler, fn) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("createQris returns the gateway's data payload on success", async () => {
  await withMockGateway(
    (req, res) => {
      assert.equal(req.headers["x-api-key"], "secret");
      assert.match(req.url, /^\/create-qris\?amount=25000$/);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: { qris_id: "abc", trx_id: "TRX-1", amount: 25000 } }));
    },
    async (baseUrl) => {
      const data = await createQris({ baseUrl, apiKey: "secret", amount: 25000 });
      assert.deepEqual(data, { qris_id: "abc", trx_id: "TRX-1", amount: 25000 });
    }
  );
});

test("createQris throws when the gateway reports failure", async () => {
  await withMockGateway(
    (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: "invalid amount" }));
    },
    async (baseUrl) => {
      await assert.rejects(() => createQris({ baseUrl, apiKey: "secret", amount: 0 }), /invalid amount/);
    }
  );
});

test("checkPayment returns the parsed body", async () => {
  await withMockGateway(
    (req, res) => {
      assert.match(req.url, /^\/check-payment\?amount=25000&trx_id=TRX-1$/);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, paid: true }));
    },
    async (baseUrl) => {
      const result = await checkPayment({ baseUrl, apiKey: "secret", amount: 25000, trxId: "TRX-1" });
      assert.deepEqual(result, { success: true, paid: true });
    }
  );
});

test("checkPayment throws on a non-2xx response", async () => {
  await withMockGateway(
    (req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "boom" }));
    },
    async (baseUrl) => {
      await assert.rejects(() => checkPayment({ baseUrl, apiKey: "secret", amount: 1, trxId: "x" }));
    }
  );
});

test("qrisImageUrl appends format=raw", () => {
  assert.equal(qrisImageUrl("https://gw.example.com", "abc123"), "https://gw.example.com/qr/abc123?format=raw");
});
