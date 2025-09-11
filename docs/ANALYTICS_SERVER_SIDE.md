# Server-side Analytics Workflow (n8n)

This workflow ingests analytics events on the server, normalizes them, and optionally fans out to multiple destinations:
- PostgreSQL (store raw events)
- Google Analytics 4 (Measurement Protocol)
- PostHog

No manual data entry is required at runtime. This respects the rule that only the defined cost fields are manually entered elsewhere in the system.

## Files
- workflow-server-side-analytics.json — the n8n workflow to import

## Import and Configure in n8n
1) Open your n8n instance
2) Import the file workflow-server-side-analytics.json
3) Open the Webhook node and confirm:
   - Method: POST
   - Path: server-analytics
   - Response Mode: Immediately (On Received)
   - Response Code: 202
4) (Recommended) Enable authentication on the Webhook node:
   - Authentication: Header Auth
   - Header Name: X-Webhook-Token
   - Header Value: {{ANALYTICS_WEBHOOK_TOKEN}}
   Then ensure your sender includes the header X-Webhook-Token with this value.

## Event Payload Schema
Send JSON to the webhook as follows:

```json path=null start=null
{
  "event": "product_viewed",               // required string (name)
  "userId": "user_123",                   // optional if anonymousId is provided
  "anonymousId": "temp_abc",              // optional if userId is provided
  "timestamp": "2025-09-08T09:10:00Z",    // optional; defaults to now
  "properties": {                          // optional structured properties
    "asin": "B00TEST123",
    "sku": "SKU-001",
    "price": 129.9
  },
  "context": {                             // optional context (app, page, device)
    "app": { "name": "dashboard", "version": "1.0.0" },
    "page": { "url": "http://localhost:8087/products" },
    "device": { "os": "Windows" }
  }
}
```

The workflow also captures server-derived fields from headers:
- source_ip (via X-Forwarded-For, X-Real-IP, or CF-Connecting-IP)
- user_agent
- referer

## Test with cURL
Replace {{N8N_BASE_URL}} and optionally include the header token if enabled.

```bash path=null start=null
curl -X POST "{{N8N_BASE_URL}}/webhook/server-analytics" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Token: {{ANALYTICS_WEBHOOK_TOKEN}}" \
  -d '{
    "event":"product_viewed",
    "userId":"user_123",
    "properties": {"asin":"B00TEST123","price":129.9},
    "context": {"page": {"url":"http://localhost:8087/products"}}
  }'
```

## PostgreSQL Destination (optional)
The node "Save Event (PostgreSQL)" is disabled by default. Enable it after configuring credentials in n8n (e.g., "Amazon Monitor DB").

Recommended table DDL:

```sql path=null start=null
CREATE TABLE IF NOT EXISTS analytics_events (
  event_id        text PRIMARY KEY,
  event_name      text NOT NULL,
  user_id         text,
  anonymous_id    text,
  ts              timestamptz NOT NULL,
  properties_json jsonb,
  context_json    jsonb,
  source_ip       inet,
  user_agent      text,
  referer         text,
  received_at     timestamptz NOT NULL DEFAULT now()
);
```

Notes:
- The workflow inserts JSON via stringified values; ensure the column types are jsonb to store structured data.
- If inet parsing fails for source_ip, you can switch the type to text.

## Google Analytics 4 (optional)
The node "Send to GA4 (optional)" is disabled by default. To enable:
1) Set the following environment variables on your n8n server:
   - GA4_MEASUREMENT_ID
   - GA4_API_SECRET
2) Enable the node and deploy. The workflow will send events via Measurement Protocol.

Payload mapping:
- client_id: anonymousId | userId | 'server'
- user_id: userId (if present)
- events[0].name: event
- events[0].params: properties
- timestamp_micros: derived from timestamp

## PostHog (optional)
The node "Send to PostHog (optional)" is disabled by default. To enable:
1) Set these environment variables on your n8n server:
   - POSTHOG_API_KEY
   - POSTHOG_HOST (optional; defaults to https://app.posthog.com)
2) Enable the node and deploy.

Payload mapping:
- event: event
- distinct_id: userId | anonymousId | 'server'
- properties: properties
- timestamp: timestamp

## Security
- Prefer Header Auth on the Webhook node (X-Webhook-Token), or place n8n behind your API gateway with auth.
- Do not log secrets. Configure GA4/PostHog via environment variables.

## Compatibility with Existing System
- This workflow does not alter existing /api/analytics endpoints in the backend. It only provides an ingestion pipeline that you can adopt progressively.
- It does not introduce any new manual data entry fields beyond what already exists in the project.

