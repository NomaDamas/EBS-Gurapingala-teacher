const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
const gatewayId = String(process.env.CLOUDFLARE_AI_GATEWAY_ID || "ebs-gurapingala").trim();

if (!accountId || !apiToken) {
  throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");
}

const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai-gateway/gateways`;
const headers = {
  authorization: `Bearer ${apiToken}`,
  "content-type": "application/json"
};

const existing = await fetch(`${baseUrl}/${gatewayId}`, { headers });
if (existing.ok) {
  console.log(`AI Gateway already exists: ${gatewayId}`);
  process.exit(0);
}
if (existing.status !== 404) {
  throw new Error(`AI Gateway lookup failed: ${existing.status} ${await existing.text()}`);
}

const created = await fetch(baseUrl, {
  method: "POST",
  headers,
  body: JSON.stringify({
    id: gatewayId,
    collect_logs: false,
    cache_ttl: 0,
    cache_invalidate_on_update: true,
    rate_limiting_interval: 0,
    rate_limiting_limit: 0
  })
});
if (!created.ok) {
  throw new Error(`AI Gateway creation failed: ${created.status} ${await created.text()}`);
}

console.log(`AI Gateway created: ${gatewayId}`);
