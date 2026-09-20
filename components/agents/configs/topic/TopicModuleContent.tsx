/**
 * Topic Module Content (components/agents/configs/topic/TopicModuleContent.tsx)
 *
 * Functionality:
 * - Custom three-column module layout for the topic agent: tag/inputs panel, results workspace, and user manual.
 * - Renders idle, running skeleton, and failed states around the workspace.
 * - Holds local UI-only state for the selected discipline tags.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TagInput } from "@/components/ui/tag-input";
import { UserManual } from "@/components/module/user-manual";
import { ScrollColumn } from "../shared/ScrollColumn";
import type { ModuleContentProps } from "../../agent-page-template";
import { Sparkles, Search } from "lucide-react";

/** Three-column module layout for the topic-selection agent. */
export function TopicModuleContent(props: ModuleContentProps) {
  const { inputs, workspace, status, errorMessage } = props;
  const t = useTranslations("moduleInputs.topic");
  // Local-only selected discipline tags; currently decorative.
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  return (
    <div className="h-full p-4 sm:px-6">
      <div className="grid h-full gap-4 lg:grid-cols-[320px_1fr_300px]">
        <ScrollColumn>
          <div className="cosmic-panel rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Search className="h-4 w-4" />
              {t("researchQuestion")}
            </h3>
            <TagInput
              options={["教育", "医学", "计算机", "工程", "社会科学"]}
              selected={selectedTags}
              onChange={setSelectedTags}
            />
            <div className="space-y-2">{inputs}</div>
          </div>
        </ScrollColumn>

        <ScrollColumn>
          {status === "failed" && (
            <div className="mb-3 rounded-md border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">
              <p className="font-medium">候选选题运行失败</p>
              <p className="mt-1 break-words text-xs">{errorMessage || "未返回错误详情，请查看开发服务器日志"}</p>
            </div>
          )}
          {status === "idle" && (
            <div className="cosmic-panel rounded-xl p-6 flex flex-col items-center justify-center min-h-[300px] text-muted-foreground">
              <Sparkles className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">{t("generateCandidates")}</p>
              <p className="text-xs mt-1 opacity-60">配置左侧参数后点击运行按钮</p>
            </div>
          )}
          {status === "running" && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="cosmic-panel rounded-xl p-4 animate-pulse">
                  <div className="h-4 w-3/4 bg-muted rounded mb-2" />
                  <div className="h-3 w-full bg-muted rounded mb-1" />
                  <div className="h-3 w-2/3 bg-muted rounded mb-3" />
                  <div className="flex gap-2">
                    <div className="h-5 w-16 bg-muted rounded-full" />
                    <div className="h-5 w-16 bg-muted rounded-full" />
                    <div className="h-5 w-16 bg-muted rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {status !== "idle" && status !== "running" && workspace}
        </ScrollColumn>

        <ScrollColumn>
          <UserManual agentId="topic" />
        </ScrollColumn>
      </div>
    </div>
  );
}
