import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownText } from "@/components/ui/markdown-text";

describe("MarkdownText", () => {
  it("renders markdown headings, lists, and code", () => {
    render(<MarkdownText content={"## 结果\n\n- 一\n- 二\n\n`code`"} />);
    expect(screen.getByRole("heading", { name: "结果" })).toBeInTheDocument();
    expect(screen.getByText("一")).toBeInTheDocument();
    expect(screen.getByText("code")).toBeInTheDocument();
  });

  it("renders bold Chinese text", () => {
    const { container } = render(<MarkdownText content="**Python使用**" />);
    expect(container.querySelector("strong")?.textContent).toBe("Python使用");
  });

  it("renders a markdown table", () => {
    const { container } = render(<MarkdownText content={"| 项目 | 值 |\n| --- | --- |\n| Python | 使用 |"} />);
    expect(container.querySelector("table")).toBeInTheDocument();
    expect(container.querySelector("th")?.textContent).toBe("项目");
    expect(container.querySelector("td")?.textContent).toBe("Python");
  });

  it("recovers headings, lists, and tables from collapsed markdown", () => {
    const content = "您好！**iScholar** 是平台。 ## 如何使用？ 1. 第一步 2. 第二步";
    const { container } = render(<MarkdownText content={content} />);
    expect(container.querySelector("h2")?.textContent).toBe("如何使用？");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("strong")?.textContent).toBe("iScholar");
  });

  it("recovers escaped newline sequences from streamed API text", () => {
    const { container } = render(<MarkdownText content={"## 标题\\n\\n**Python使用**"} />);
    expect(container.querySelector("h2")?.textContent).toBe("标题");
    expect(container.querySelector("strong")?.textContent).toBe("Python使用");
  });

  it("recovers horizontal rules and headings from TopicScout-style inline markdown", () => {
    const { container } = render(<MarkdownText content={"说明如下： --- ### 1. 创新性（Novelty） – 1-10 分 **定义**：这个选题是否足够新？"} />);
    expect(container.querySelector("hr")).toBeInTheDocument();
    expect(container.querySelector("h3")).toBeInTheDocument();
    expect(container.querySelector("strong")?.textContent).toBe("定义");
  });

  it("recovers a table immediately after a horizontal rule", () => {
    const content = "好的，整理成表格： --- | 维度 | 英文 | 评分范围 | |------|------|----------| | 🔬 创新性 | Novelty | 1-10 | 足够新 |";
    const { container } = render(<MarkdownText content={content} />);
    expect(container.querySelector("hr")).toBeInTheDocument();
    expect(container.querySelector("table")).toBeInTheDocument();
    expect(container.querySelector("th")?.textContent).toBe("维度");
  });

  it("does not render raw html or unsafe links", () => {
    const { container } = render(<MarkdownText content={'<script>alert(1)</script> [危险](javascript:alert(1))'} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("href")).toBe("#");
  });
});
