import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const frontend = path.resolve(
  new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"),
);
const script = path.join(frontend, "scripts", "dc-to-react.legacy.mjs");
const design = path.resolve(frontend, "..", "design", "claude-design");

test("conversor recusa qualquer saída dentro do código de produção", () => {
  const result = spawnSync(
    process.execPath,
    [script, design, path.join(frontend, "src", "design-generated")],
    {
      cwd: frontend,
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Saída protegida/);
});

test("preview do design é gerado fora de src sem alterar uma página de produção", async () => {
  const before = await readFile(
    path.join(frontend, "src", "pages", "Home.jsx"),
    "utf8",
  );
  const output = await mkdtemp(path.join(tmpdir(), "nekoflow-design-"));
  try {
    const result = spawnSync(process.execPath, [script, design, output], {
      cwd: frontend,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr);
    const generated = await readFile(
      path.join(output, "pages", "Home.jsx"),
      "utf8",
    );
    assert.match(generated, /Preview gerado/);
    assert.equal(
      await readFile(path.join(frontend, "src", "pages", "Home.jsx"), "utf8"),
      before,
    );
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
