import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPdfTextWithVisualDescriptions,
  cleanParsedText,
  htmlToMarkdownText,
  isDecorativeImage,
  isScannedPdfText,
  readImageDimensions,
  splitParentChunks,
} from "./document-processor.js";

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
        "一、基本原则",
        "这里是基本原则正文，描述原则。",
        "",
        "（一）管理要求",
        "这里是管理要求正文，描述要求。",
        "",
        "1.1 适用范围",
        "这里是适用范围正文，描述适用对象。",
      ].join("\n"),
    );

    assert.equal(chunks.length, 4);
    assert.deepEqual(chunks[0]?.headingPath, ["第一章 总则"]);
    assert.deepEqual(chunks[1]?.headingPath, ["第一章 总则", "一、基本原则"]);
    assert.deepEqual(chunks[2]?.headingPath, ["第一章 总则", "一、基本原则", "（一）管理要求"]);
    assert.deepEqual(chunks[3]?.headingPath, ["第一章 总则", "1.1 适用范围"]);
  });

  void it("does not detect normal short sentences as headings", () => {
    const chunks = splitParentChunks(
      [
        "第一章 总则",
        "普通短句",
        "这里继续说明普通短句，不应该产生新的标题路径。",
      ].join("\n"),
    );

    assert.equal(chunks.length, 1);
    const chunk = chunks[0];
    assert.ok(chunk);
    assert.deepEqual(chunk.headingPath, ["第一章 总则"]);
    assert.match(chunk.content, /普通短句/);
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

  void it("keeps page ranges granular when one long section splits across pages", () => {
    const longLine = "制度正文内容".repeat(320);
    const chunks = splitParentChunks(
      [
        "第一章 长章节",
        longLine,
        pageBreak(2),
        longLine,
        pageBreak(3),
        longLine,
      ].join("\n"),
    );

    assert.ok(chunks.length >= 2);
    const first = chunks[0];
    const second = chunks[1];
    assert.ok(first);
    assert.ok(second);
    assert.equal(first.pageStart, 1);
    assert.equal(first.pageEnd, 1);
    assert.equal(second.pageStart, 2);
    assert.notDeepEqual(
      chunks.map((chunk) => [chunk.pageStart, chunk.pageEnd]),
      chunks.map(() => [1, 3]),
    );
  });
});

void describe("document multimodal helpers", () => {
  void it("detects scanned PDFs by sparse text per page", () => {
    assert.equal(isScannedPdfText(`${pageBreak(1)}\n   \n${pageBreak(2)}\n短`, 2), true);
    assert.equal(isScannedPdfText(`${pageBreak(1)}\n${"制度正文".repeat(30)}`, 1), false);
  });

  void it("filters likely decorative images by size and keeps unknown dimensions", () => {
    assert.equal(isDecorativeImage(80, 80), true);
    assert.equal(isDecorativeImage(300, 20), true);
    assert.equal(isDecorativeImage(240, 180), false);
    assert.equal(isDecorativeImage(null, null), false);
  });

  void it("keeps mammoth image placeholders in document order when converting HTML", () => {
    const text = htmlToMarkdownText(
      '<h1>标题</h1><p>第一段</p><p><img src="[[KNOWFLOW_DOCX_IMAGE:1]]" /></p><p>第二段</p>',
    );

    assert.match(text, /^# 标题/);
    assert.match(text, /第一段\n\n\[\[KNOWFLOW_DOCX_IMAGE:1\]\]\n\n第二段/);
  });

  void it("inserts PDF visual descriptions after their source pages", () => {
    const text = buildPdfTextWithVisualDescriptions(
      [
        { num: 1, text: "第一页正文" },
        { num: 2, text: "第二页正文" },
      ],
      [
        { pageNumber: 2, sourceLabel: "PDF 第 2 页图片 X", text: "第二页图片描述" },
        { pageNumber: 1, sourceLabel: "PDF 第 1 页图片 Y", text: "第一页图片描述" },
      ],
    );

    assert.match(
      text,
      /\[\[KNOWFLOW_PAGE_BREAK:1\]\]\n\n第一页正文\n\n## PDF 第 1 页图片 Y\n\n第一页图片描述/,
    );
    assert.match(
      text,
      /\[\[KNOWFLOW_PAGE_BREAK:2\]\]\n\n第二页正文\n\n## PDF 第 2 页图片 X\n\n第二页图片描述/,
    );
  });

  void it("reads PNG dimensions for decorative filtering", () => {
    const png = Buffer.from(
      "89504e470d0a1a0a0000000d494844520000012c000000c80802000000",
      "hex",
    );

    assert.deepEqual(readImageDimensions(png, "image/png"), { width: 300, height: 200 });
  });
});
