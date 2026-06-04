import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cleanParsedText, splitParentChunks } from "./document-processor.js";

const pageBreak = (page: number): string => `[[KNOWFLOW_PAGE_BREAK:${String(page)}]]`;

void describe("document text cleaning", () => {
  void it("removes control characters and merges PDF hard-wrapped paragraph lines", () => {
    const result = cleanParsedText(
      "制度正文第一行内容较长\u0000\n第二行继续说明同一段落\n\n下一段保留",
    );

    assert.equal(result.text, "制度正文第一行内容较长第二行继续说明同一段落\n\n下一段保留");
    assert.deepEqual(result.warnings, ["control_chars_removed"]);
  });

  void it("keeps markdown tables line-bounded while cleaning surrounding text", () => {
    const result = cleanParsedText(
      [
        "表格说明第一行内容较长",
        "第二行继续说明",
        "",
        "| 字段 | 含义 |",
        "| --- | --- |",
        "| owner | 负责人 |",
      ].join("\n"),
    );

    assert.match(result.text, /表格说明第一行内容较长第二行继续说明/);
    assert.match(result.text, /\| 字段 \| 含义 \|\n\| --- \| --- \|\n\| owner \| 负责人 \|/);
  });

  void it("removes repeated page chrome and standalone page numbers", () => {
    const result = cleanParsedText(
      [
        "Knowflow Handbook",
        "第一段正文内容足够长",
        "1",
        pageBreak(2),
        "Knowflow Handbook",
        "第二段正文内容足够长",
        "2",
      ].join("\n"),
    );

    assert.equal(result.text.includes("Knowflow Handbook"), false);
    assert.equal(result.text.includes("\n1\n"), false);
    assert.match(result.text, /第一段正文内容足够长/);
    assert.match(result.text, /第二段正文内容足够长/);
    assert.deepEqual(result.warnings, ["repeated_page_chrome_removed"]);
  });
});

void describe("document chunking", () => {
  void it("detects Chinese and numbered headings into heading paths", () => {
    const chunks = splitParentChunks(
      [
        "第一章 总则",
        "这里是总则正文，描述制度背景。",
        "",
        "1.1 适用范围",
        "这里是适用范围正文，描述适用对象。",
      ].join("\n"),
    );

    assert.equal(chunks.length, 2);
    assert.deepEqual(chunks[0]?.headingPath, ["第一章 总则"]);
    assert.deepEqual(chunks[1]?.headingPath, ["第一章 总则", "1.1 适用范围"]);
  });

  void it("fills parent chunk page ranges from page markers", () => {
    const chunks = splitParentChunks(
      [
        "第一章 总则",
        "第一页正文内容。",
        pageBreak(2),
        "第二章 范围",
        "第二页正文内容。",
      ].join("\n"),
    );

    const first = chunks[0];
    const second = chunks[1];
    assert.ok(first);
    assert.ok(second);
    assert.equal(first.pageStart, 1);
    assert.equal(first.pageEnd, 1);
    assert.equal(second.pageStart, 2);
    assert.equal(second.pageEnd, 2);
  });
});
