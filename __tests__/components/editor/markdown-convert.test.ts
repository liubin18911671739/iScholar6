import { describe, it, expect } from "vitest";
import { markdownToHtml, htmlToMarkdown } from "@/components/editor/markdown-convert";

describe("markdownToHtml", () => {
  it("converts headers", () => {
    expect(markdownToHtml("# Title")).toContain("<h1");
    expect(markdownToHtml("## Section")).toContain("<h2");
    expect(markdownToHtml("### Sub")).toContain("<h3");
  });

  it("converts bold and italic", () => {
    expect(markdownToHtml("**bold**")).toContain("<strong>bold</strong>");
    expect(markdownToHtml("*italic*")).toContain("<em>italic</em>");
  });

  it("converts inline code", () => {
    expect(markdownToHtml("`code`")).toContain("<code>code</code>");
  });

  it("converts links", () => {
    const result = markdownToHtml("[link](https://example.com)");
    expect(result).toContain("href=\"https://example.com\"");
    expect(result).toContain("link");
  });

  it("handles empty string", () => {
    expect(markdownToHtml("")).toBe("");
  });

  it("converts unordered lists", () => {
    const result = markdownToHtml("- item 1\n- item 2");
    expect(result).toContain("<li");
  });

  it("repairs streamed assistant markdown with malformed emphasis", () => {
    const result = markdownToHtml(
      "请比较三个课题。 ***我可以对每个想法进行新颖性、价值和可行性评价。 3. **这个领域还有哪些研究空白？**"
    );
    expect(result).not.toContain("**");
    expect(result).toContain("这个领域还有哪些研究空白？");
  });

  it("keeps tables usable after collapsed assistant prose", () => {
    const result = markdownToHtml(
      "好的，整理成表格： --- | 课题 | 新颖性 | 价值 | | --- | --- | --- | | 课题一 | 8 | 9 |"
    );
    expect(result).toContain("<table>");
    expect(result).toContain("课题一");
  });

  it("renders assistant paragraphs with spaces around emphasis markers", () => {
    const result = markdownToHtml(
      "2. **您目前关注哪些关键词或研究方向？ **（例如：强化学习） 3. **候选推荐** - **Topic 1**：面向基础研究"
    );
    expect(result).toContain("<strong>您目前关注哪些关键词或研究方向？</strong>");
    expect(result).toContain("<strong>候选推荐</strong>");
    expect(result).not.toContain("**");
  });

  it("expands a collapsed multi-row assistant table", () => {
    const result = markdownToHtml(
      "表格如下： --- ### 候选研究主题表格 | 候选主题 | 研究缺口 | 新颖性 | 可行性 | 简要理由 | |----------|----------|----------|----------|----------| | 面向大语言模型的方法 | 现有解释方法成本高 | 8 | 9 | 满足需求 | 基于联邦学习的医疗隐私框架 | 异构数据问题未解决 | 7 | 9 | 高价值场景 | --- 现在请告诉我研究方向"
    );
    expect(result).toContain("<table>");
    expect(result).toContain("面向大语言模型的方法");
  });

  it("renders a prose-prefixed trend comparison table", () => {
    const result = markdownToHtml(
      "明白了，你希望用**表格**的形式来呈现研究趋势分析。我可以为你生成一个趋势对比表格，包含以下几个维度，方便一目了然地比较： | 维度 | 说明 | |--------|--------| | **趋势主题** | 当前该领域的热点方向 | | **热度趋势** | 上升 / 平稳 / 下降 | | **研究空白（Gap）** | 文献中尚待解决的问题 | | **潜力评级（1-10）** | 综合考虑新颖性 + 价值 + 可行性 | | **简要理由** | 为什么这个方向值得关注 | --- 不过，我需要你提供两个信息"
    );
    expect(result).toContain("<table>");
    expect(result).toContain("趋势主题");
    expect(result).toContain("热度趋势");
  });
});

describe("htmlToMarkdown", () => {
  it("converts headers back", () => {
    expect(htmlToMarkdown("<h1>Title</h1>")).toContain("# Title");
    expect(htmlToMarkdown("<h2>Section</h2>")).toContain("## Section");
  });

  it("converts bold and italic back", () => {
    expect(htmlToMarkdown("<strong>bold</strong>")).toContain("**bold**");
    expect(htmlToMarkdown("<em>italic</em>")).toContain("*italic*");
  });

  it("handles empty string", () => {
    expect(htmlToMarkdown("")).toBe("");
  });
});
