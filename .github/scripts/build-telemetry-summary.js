// Builds docs/telemetry-summary.json from the tmax Application Insights
// resource. Queries the read-only Analytics REST API with an API key (never
// exposed to the public stats page - only aggregate counts are committed).
//
// Uniqueness is counted by the anonymous, hashed machineId. Smoke-test events
// (application_Version starting with "smoketest") are excluded.
//
// Env: APPINSIGHTS_API_KEY (App Insights read API key).

const fs = require('node:fs');
const https = require('node:https');

const APP_ID = '608c32b6-5091-4828-b948-26ce9b41474d';
const API_KEY = process.env.APPINSIGHTS_API_KEY;
const OUT_PATH = 'docs/telemetry-summary.json';

if (!API_KEY) {
  console.error('APPINSIGHTS_API_KEY not set; nothing to do.');
  process.exit(0);
}

// Common filter: real usage-ping events only (drop smoke tests), with a
// non-empty machineId projected as `mid`. The machineId is a full SHA-256 hex
// digest (64 chars); we require that length so legacy pings from earlier builds
// that used a truncated 16-char hash are ignored and don't inflate user counts.
const BASE = `customEvents
| where name == "usage-ping"
| where isempty(application_Version) or application_Version !startswith "smoketest"
| extend mid = tostring(customDimensions.machineId)
| where isnotempty(mid) and strlen(mid) == 64`;

const QUERIES = {
  // Windowed distinct-machine counts in a single row.
  windows: `${BASE}
| summarize
    dau = dcountif(mid, timestamp >= startofday(now())),
    wau = dcountif(mid, timestamp >= ago(7d)),
    mau = dcountif(mid, timestamp >= ago(30d)),
    total = dcount(mid)`,
  // Distinct machines per UTC day.
  daily: `${BASE}
| summarize users = dcount(mid) by day = format_datetime(startofday(timestamp), "yyyy-MM-dd")
| order by day asc`,
  // Breakdowns over the last 30 days.
  byOs: `${BASE}
| where timestamp >= ago(30d)
| summarize users = dcount(mid) by key = tostring(customDimensions.os)
| order by users desc`,
  byVersion: `${BASE}
| where timestamp >= ago(30d)
| summarize users = dcount(mid) by key = tostring(application_Version)
| order by users desc`,
  byTimezone: `${BASE}
| where timestamp >= ago(30d)
| summarize users = dcount(mid) by key = tostring(customDimensions.timezone)
| order by users desc`,
};

function runQuery(query) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify({ query }), 'utf8');
    const req = https.request(
      {
        method: 'POST',
        hostname: 'api.applicationinsights.io',
        path: `/v1/apps/${APP_ID}/query`,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body.length,
          'x-api-key': API_KEY,
        },
        timeout: 30000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if ((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Bad JSON: ${e.message}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.write(body);
    req.end();
  });
}

// Application Insights returns { tables: [ { columns: [{name}], rows: [[...]] } ] }.
function rows(result) {
  const table = result?.tables?.[0];
  if (!table) return [];
  const cols = table.columns.map((c) => c.name);
  return table.rows.map((r) => {
    const o = {};
    cols.forEach((name, i) => (o[name] = r[i]));
    return o;
  });
}

function toBreakdown(result) {
  const out = {};
  for (const row of rows(result)) {
    const key = row.key && String(row.key).trim() ? String(row.key) : 'unknown';
    out[key] = Number(row.users) || 0;
  }
  return out;
}

(async function main() {
  try {
    const [windows, daily, byOs, byVersion, byTimezone] = await Promise.all([
      runQuery(QUERIES.windows),
      runQuery(QUERIES.daily),
      runQuery(QUERIES.byOs),
      runQuery(QUERIES.byVersion),
      runQuery(QUERIES.byTimezone),
    ]);

    const w = rows(windows)[0] || {};
    const summary = {
      generatedAt: new Date().toISOString(),
      dau: Number(w.dau) || 0,
      wau: Number(w.wau) || 0,
      mau: Number(w.mau) || 0,
      total: Number(w.total) || 0,
      daily: rows(daily).map((r) => ({ date: r.day, users: Number(r.users) || 0 })),
      byOs: toBreakdown(byOs),
      byVersion: toBreakdown(byVersion),
      byTimezone: toBreakdown(byTimezone),
    };

    fs.writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2) + '\n');
    console.log(
      `Wrote ${OUT_PATH}: DAU=${summary.dau} WAU=${summary.wau} MAU=${summary.mau} total=${summary.total}, ${summary.daily.length} days.`,
    );
  } catch (e) {
    // Never fail the workflow on a telemetry hiccup; just skip this snapshot.
    console.error('Telemetry summary failed:', e.message);
    process.exit(0);
  }
})();
