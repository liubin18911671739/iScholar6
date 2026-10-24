#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { marked } from "marked";
import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const docDir = resolve(root, "doc");
const outputPath = resolve(docDir, "roadshow.pdf");
const screenshots = [
  ["00-project-created.png", "项目建立"],
  ["01-research-input.png", "研究输入"],
  ["02-topic-approval.png", "选题阶段等待人工确认"],
  ["03-final-approval.png", "最终方案等待审批"],
  ["04-workflow-complete.png", "最终方案已批准"],
];

const markdown = await readFile(resolve(docDir, "roadshow.md"), "utf8");
const content = marked.parse(markdown);
const figures = await Promise.all(screenshots.map(async ([file, caption]) => {
  const bytes = await readFile(resolve(docDir, "roadshow-evidence", file));
  const src = `data:image/png;base64,${bytes.toString("base64")}`;
  return `<figure><img src="${src}" alt="${caption}"><figcaption>${caption} · ${file}</figcaption></figure>`;
}));

const appendix = [0, 2, 4].map((start, pageIndex) => {
  const pair = figures.slice(start, start + 2).join("");
  return `<section class="appendix-page"><h2>现场截图${pageIndex ? `（${pageIndex + 1}）` : ""}</h2><div class="figure-grid">${pair}</div></section>`;
}).join("");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="file://${docDir}/">
<title>iScholar 综合路演</title>
<style>
  @page { size: A4; margin: 16mm 17mm 18mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    color: #172033;
    font-family: "Hiragino Sans GB", "PingFang SC", "STSong", sans-serif;
    font-size: 10pt;
    line-height: 1.62;
    margin: 0;
  }
  h1 { color: #102b45; font-size: 25pt; line-height: 1.25; margin: 0 0 8mm; padding-bottom: 4mm; border-bottom: 2px solid #14b8a6; }
  h2 { color: #123552; font-size: 16pt; margin: 9mm 0 3mm; break-after: avoid; }
  h3 { color: #18566a; font-size: 12pt; margin: 6mm 0 2mm; break-after: avoid; }
  h4 { color: #23435c; font-size: 10.5pt; margin: 4mm 0 2mm; break-after: avoid; }
  p { margin: 2.2mm 0; orphans: 3; widows: 3; }
  blockquote { margin: 3mm 0; padding: 2mm 4mm; border-left: 3px solid #12a99a; background: #effaf8; color: #223a49; break-inside: avoid; }
  blockquote p { margin: 1mm 0; }
  ul, ol { padding-left: 6mm; margin: 2mm 0 3mm; }
  li { padding-left: 1mm; margin: 1mm 0; }
  table { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm; font-size: 9pt; break-inside: auto; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { color: #fff; background: #164e63; text-align: left; }
  th, td { padding: 2mm 2.5mm; border: 1px solid #cfdae3; vertical-align: top; }
  tr:nth-child(even) td { background: #f5f8fa; }
  code { color: #075985; background: #eef5f8; padding: 0.2mm 1mm; border-radius: 2px; font-size: 9pt; overflow-wrap: anywhere; }
  a { color: #087e8b; text-decoration: underline; }
  strong { color: #102f48; }
  hr { border: 0; border-top: 1px solid #dbe5eb; margin: 6mm 0; }
  .appendix-page { break-before: page; page-break-before: always; }
  .appendix-page h2 { margin-top: 0; padding-bottom: 2mm; border-bottom: 1px solid #b8d7dd; }
  .figure-grid { display: flex; flex-direction: column; gap: 5mm; }
  figure { margin: 0; padding: 2mm; border: 1px solid #dbe5eb; border-radius: 2mm; break-inside: avoid; text-align: center; }
  figure img { display: block; width: 100%; max-height: 106mm; object-fit: contain; }
  figcaption { color: #526777; font-size: 8.5pt; padding-top: 1.5mm; }
  .foot { font-family: sans-serif; font-size: 8pt; color: #6b7c89; width: 100%; text-align: center; }
</style>
</head>
<body>
<main>${content}</main>
${appendix}
</body>
</html>`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: '<div class="foot">iScholar 综合路演 · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    preferCSSPageSize: true,
  });
} finally {
  await browser.close();
}

console.log(`Created ${outputPath}`);
