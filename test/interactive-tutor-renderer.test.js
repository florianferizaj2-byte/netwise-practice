import test from "node:test";
import assert from "node:assert/strict";
import { render, validate } from "../src/generated/tutor-renderer.js";
test("trusted component renderer rejects unknown executable fields and escapes content", () => {
  const input = {
    schemaVersion: 1,
    components: [
      {
        type: "ExplanationCard",
        id: "safe-text",
        title: '<img src=x onerror="alert(1)">',
        paragraphs: ["<script>window.pwned=true</script>"],
      },
    ],
  };
  const html = render(input, {});
  assert(!html.includes("<script>"));
  assert(!html.includes("<img"));
  assert(html.includes("&lt;script&gt;"));
  assert.throws(() =>
    validate({
      ...input,
      components: [{ ...input.components[0], html: "<img>" }],
    }),
  );
  assert.throws(() =>
    validate({
      ...input,
      components: [
        { type: "NetworkDiagram", id: "bad", svg: "<svg onload=alert(1)>" },
      ],
    }),
  );
  assert.throws(() =>
    validate({
      ...input,
      components: [{ type: "React", id: "bad", code: "return eval()" }],
    }),
  );
});
