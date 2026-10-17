// Protocol-level test: real client over stdio and over HTTP, every tool, plus the error paths.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const body = (r) => JSON.parse(r.content[0].text);

async function exercise(client, label) {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["find_words", "get_citation", "get_placement_basis", "get_word_list", "get_words_for_grade", "list_word_lists"]);

  const all = body(await client.callTool({ name: "list_word_lists", arguments: {} }));
  assert.equal(all.count, 254);
  const en = body(await client.callTool({ name: "list_word_lists", arguments: { language: "en" } }));
  assert.equal(en.count, 38);
  const kg = body(await client.callTool({ name: "list_word_lists", arguments: { grade: "kindergarten" } }));
  assert.equal(kg.count, 23);
  assert.ok(kg.lists.every((l) => l.language === "en" && l.grades));
  const sights = body(await client.callTool({ name: "list_word_lists", arguments: { grade: "grade-1", section: "sight" } }));
  assert.ok(sights.lists.some((l) => l.id === "first-grade"));

  const sa = body(await client.callTool({ name: "get_word_list", arguments: { id: "short-a" } }));
  assert.equal(sa.words.length, 45);
  assert.equal(sa.placementBasis, "RF.K.2.d, RF.K.3.b");
  assert.equal(sa.placementBasisDetail.kind, "standard");
  assert.equal(sa.license, "CC BY 4.0");
  const missing = await client.callTool({ name: "get_word_list", arguments: { id: "nope" } });
  assert.equal(missing.isError, true);

  const g1 = body(await client.callTool({ name: "get_words_for_grade", arguments: { grade: "grade-1", section: "digraphs", limit: 20 } }));
  assert.equal(g1.returned, 20);
  assert.ok(g1.totalDifferentWords > 100);

  const sh = body(await client.callTool({ name: "find_words", arguments: { starts_with: "sh", language: "en", limit: 10 } }));
  assert.ok(sh.totalMatches > 5 && sh.matches.every((m) => m.word.toLowerCase().startsWith("sh")));
  const none = await client.callTool({ name: "find_words", arguments: {} });
  assert.equal(none.isError, true);

  const basis = body(await client.callTool({ name: "get_placement_basis", arguments: {} }));
  assert.ok(basis.bases.dolch && basis.bases.typical);
  const cite = body(await client.callTool({ name: "get_citation", arguments: {} }));
  assert.equal(cite.license.name, "CC BY 4.0");
  console.log(`  ✓ ${label}: 6 tools, filters, errors, limits`);
}

{
  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StdioClientTransport({ command: "node", args: ["dist/stdio.js"] }));
  await exercise(client, "stdio");
  await client.close();
}
{
  const port = 8792;
  const srv = spawn("node", ["dist/http.js"], { env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "ignore", "pipe"] });
  await new Promise((ok) => srv.stderr.once("data", ok));
  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`)));
  await exercise(client, "http");
  await client.close();
  assert.equal((await fetch(`http://localhost:${port}/mcp`)).status, 405);
  assert.equal(await (await fetch(`http://localhost:${port}/health`)).text(), "ok");
  srv.kill();
}
console.log("all good");
