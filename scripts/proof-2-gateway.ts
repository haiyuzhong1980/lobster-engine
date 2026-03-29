#!/usr/bin/env tsx
/**
 * Proof Script 2: Gateway API — Real HTTP Server
 *
 * Proves: GatewayServer starts a real HTTP server, all REST endpoints
 * respond correctly, bots can be registered/listed/updated/deleted,
 * scenes can be joined/left, actions can be submitted, and
 * /health + /metrics + /api/docs/openapi.json all work.
 *
 * Run: npx tsx scripts/proof-2-gateway.ts
 */

import { GatewayServer } from '../packages/gateway/src/server.js';
import type { GatewayConfig } from '../packages/gateway/src/server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function http<T>(
  base: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: ApiResponse<T> }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as ApiResponse<T>;
  return { status: res.status, body: json };
}

// ---------------------------------------------------------------------------
// Main proof
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════');
  console.log('  PROOF 2: Gateway API — Real HTTP Server');
  console.log('═══════════════════════════════════════════════════\n');

  const results: { test: string; pass: boolean; detail: string }[] = [];
  const port = 19876 + Math.floor(Math.random() * 1000); // random port to avoid conflicts
  const base = `http://127.0.0.1:${port}`;

  // --- Start server ---
  console.log(`[0/12] Starting gateway on port ${port}...`);
  const config: GatewayConfig = { port, host: '127.0.0.1' };
  const server = new GatewayServer(config);
  await server.start();
  console.log(`  ✓ Server listening on ${base}\n`);

  try {
    // --- Test 1: Health endpoint ---
    console.log('[1/12] GET /health');
    const health = await http<{ status: string }>(base, 'GET', '/health');
    const healthPass = health.status === 200 && health.body.success && health.body.data?.status === 'ok';
    results.push({ test: 'GET /health', pass: healthPass, detail: `status=${health.status}, data=${JSON.stringify(health.body.data)}` });
    console.log(`  ${healthPass ? '✓' : '✗'} ${health.status} — ${JSON.stringify(health.body.data)}\n`);

    // --- Test 2: Metrics endpoint ---
    console.log('[2/12] GET /metrics');
    const metricsRes = await fetch(`${base}/metrics`);
    const metricsText = await metricsRes.text();
    const metricsPass = metricsRes.status === 200 && metricsText.includes('lobster_');
    results.push({ test: 'GET /metrics', pass: metricsPass, detail: `status=${metricsRes.status}, contains lobster_ metrics: ${metricsText.includes('lobster_')}` });
    console.log(`  ${metricsPass ? '✓' : '✗'} ${metricsRes.status} — Prometheus metrics (${metricsText.split('\n').length} lines)\n`);

    // --- Test 3: OpenAPI spec ---
    console.log('[3/12] GET /api/docs/openapi.json');
    const openapiRes = await fetch(`${base}/api/docs/openapi.json`);
    const openapiJson = await openapiRes.json() as Record<string, unknown>;
    // OpenAPI spec is returned directly (not wrapped in {success, data})
    const openapiPass = openapiRes.status === 200 && (openapiJson.openapi !== undefined || openapiJson.success !== undefined);
    results.push({ test: 'GET /api/docs/openapi.json', pass: openapiPass, detail: `status=${openapiRes.status}, hasSpec=${openapiJson.openapi !== undefined || openapiJson.success !== undefined}` });
    console.log(`  ${openapiPass ? '✓' : '✗'} ${openapiRes.status} — OpenAPI spec served\n`);

    // --- Test 4: Register a bot ---
    console.log('[4/12] POST /api/v1/bots/register');
    const reg = await http<{ id: string; platform: string; token: string }>(base, 'POST', '/api/v1/bots/register', {
      platform: 'openai',
      config: { model: 'gpt-4' },
      metadata: { owner: 'proof-script' },
    });
    const regPass = reg.status === 201 && reg.body.success && typeof reg.body.data?.id === 'string' && typeof reg.body.data?.token === 'string';
    const botId = reg.body.data?.id ?? 'unknown';
    results.push({ test: 'POST /bots/register', pass: regPass, detail: `status=${reg.status}, botId=${botId}, hasToken=${typeof reg.body.data?.token === 'string'}` });
    console.log(`  ${regPass ? '✓' : '✗'} ${reg.status} — Bot registered: ${botId}\n`);

    // --- Test 5: Get bot by ID (token should be stripped) ---
    console.log('[5/12] GET /api/v1/bots/:id');
    const get = await http<{ id: string; platform: string; token?: string }>(base, 'GET', `/api/v1/bots/${botId}`);
    const getPass = get.status === 200 && get.body.success && get.body.data?.id === botId && !('token' in (get.body.data ?? {}));
    results.push({ test: 'GET /bots/:id', pass: getPass, detail: `status=${get.status}, tokenStripped=${!('token' in (get.body.data ?? {}))}` });
    console.log(`  ${getPass ? '✓' : '✗'} ${get.status} — Bot found, token ${!('token' in (get.body.data ?? {})) ? 'STRIPPED (secure)' : 'EXPOSED (insecure!)'}\n`);

    // --- Test 6: List bots ---
    console.log('[6/12] GET /api/v1/bots');
    const list = await http<unknown[]>(base, 'GET', '/api/v1/bots');
    const listPass = list.status === 200 && list.body.success;
    results.push({ test: 'GET /bots (list)', pass: listPass, detail: `status=${list.status}, success=${list.body.success}` });
    console.log(`  ${listPass ? '✓' : '✗'} ${list.status} — Bot list returned\n`);

    // --- Test 7: Update bot ---
    console.log('[7/12] PATCH /api/v1/bots/:id');
    const patch = await http<{ id: string; platform: string }>(base, 'PATCH', `/api/v1/bots/${botId}`, {
      platform: 'anthropic',
      metadata: { updated: true },
    });
    const patchPass = patch.status === 200 && patch.body.success;
    results.push({ test: 'PATCH /bots/:id', pass: patchPass, detail: `status=${patch.status}, platform=${(patch.body.data as Record<string, unknown>)?.platform}` });
    console.log(`  ${patchPass ? '✓' : '✗'} ${patch.status} — Bot updated\n`);

    // --- Test 8: Join scene ---
    console.log('[8/12] POST /api/v1/scenes/join');
    const join = await http<{ id: string; sceneType: string }>(base, 'POST', '/api/v1/scenes/join', {
      botId,
      sceneType: 'werewolf',
      sceneName: 'Proof Game Room',
    });
    const joinPass = join.status === 201 && join.body.success;
    const sceneId = (join.body.data as Record<string, unknown>)?.id as string ?? 'unknown';
    results.push({ test: 'POST /scenes/join', pass: joinPass, detail: `status=${join.status}, sceneId=${sceneId}` });
    console.log(`  ${joinPass ? '✓' : '✗'} ${join.status} — Scene joined: ${sceneId}\n`);

    // --- Test 9: List scenes ---
    console.log('[9/12] GET /api/v1/scenes');
    const scenes = await http<unknown[]>(base, 'GET', '/api/v1/scenes');
    const scenesPass = scenes.status === 200 && scenes.body.success;
    results.push({ test: 'GET /scenes (list)', pass: scenesPass, detail: `status=${scenes.status}` });
    console.log(`  ${scenesPass ? '✓' : '✗'} ${scenes.status} — Scene list returned\n`);

    // --- Test 10: Submit action ---
    console.log('[10/12] POST /api/v1/scenes/:id/action');
    const action = await http<{ success: boolean }>(base, 'POST', `/api/v1/scenes/${sceneId}/action`, {
      botId,
      type: 'vote',
      content: 'I vote to eliminate Player_2',
      target: 'player_2',
    });
    // Accept both 200 (action processed) and 201 (action accepted)
    const actionPass = (action.status === 200 || action.status === 201) && action.body.success;
    results.push({ test: 'POST /scenes/:id/action', pass: actionPass, detail: `status=${action.status}, error=${action.body.error ?? 'none'}` });
    console.log(`  ${actionPass ? '✓' : '✗'} ${action.status} — Action: ${action.body.success ? 'submitted' : action.body.error}\n`);

    // --- Test 11: Leave scene ---
    console.log('[11/12] POST /api/v1/scenes/leave');
    const leave = await http<unknown>(base, 'POST', '/api/v1/scenes/leave', {
      botId,
      sceneId,
    });
    const leavePass = leave.status === 200 && leave.body.success;
    results.push({ test: 'POST /scenes/leave', pass: leavePass, detail: `status=${leave.status}` });
    console.log(`  ${leavePass ? '✓' : '✗'} ${leave.status} — Scene left\n`);

    // --- Test 12: Delete bot ---
    console.log('[12/12] DELETE /api/v1/bots/:id');
    const del = await http<unknown>(base, 'DELETE', `/api/v1/bots/${botId}`);
    const delPass = del.status === 200 && del.body.success;
    results.push({ test: 'DELETE /bots/:id', pass: delPass, detail: `status=${del.status}` });
    console.log(`  ${delPass ? '✓' : '✗'} ${del.status} — Bot deleted\n`);

    // --- Verify bot is gone ---
    const verify = await http<unknown>(base, 'GET', `/api/v1/bots/${botId}`);
    const verifyPass = verify.status === 404;
    results.push({ test: 'Verify deletion (404)', pass: verifyPass, detail: `status=${verify.status}` });

    // --- Input validation proof ---
    console.log('[Bonus] Input validation checks...');
    const badId = await http<unknown>(base, 'POST', '/api/v1/scenes/join', {
      botId: 'evil.>.>',
      sceneType: 'werewolf',
    });
    const validationPass = badId.status === 400 && !badId.body.success;
    results.push({ test: 'NATS injection blocked', pass: validationPass, detail: `botId="evil.>.>" → ${badId.status} ${badId.body.error}` });
    console.log(`  ${validationPass ? '✓' : '✗'} Malicious botId "evil.>.>" rejected: ${badId.status}\n`);

  } finally {
    // --- Shutdown ---
    console.log('Stopping server...');
    await server.stop();
    console.log('  ✓ Server stopped\n');
  }

  // --- Summary ---
  console.log('═══════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('═══════════════════════════════════════════════════');
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  for (const r of results) {
    console.log(`  ${r.pass ? '✓ PASS' : '✗ FAIL'} ${r.test}`);
    console.log(`         ${r.detail}`);
  }
  console.log('───────────────────────────────────────────────────');
  console.log(`  ${passed}/${total} passed${passed === total ? ' — GATEWAY WORKS!' : ' — ISSUES FOUND'}`);
  console.log('═══════════════════════════════════════════════════\n');

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
