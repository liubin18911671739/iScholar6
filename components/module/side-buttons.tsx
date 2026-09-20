/**
 * Side Buttons (components/module/side-buttons.tsx)
 *
 * Functionality:
 * - Renders the fixed right-edge floating buttons for opening the user manual and the module assistant.
 * - Reflects each button's open state with a highlighted ring and localized tooltips.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useTranslations } from "next-intl";
import { HelpCircle, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Props for the floating side buttons and their open state. */
interface SideButtonsProps {
  manualOpen: boolean;
  chatOpen: boolean;
  onToggleManual: () => void;
  onToggleChat: () => void;
}

/** Fixed side buttons toggling the manual and assistant sheets. */
export function SideButtons({
  manualOpen,
  chatOpen,
  onToggleManual,
  onToggleChat,
}: SideButtonsProps) {
  const t = useTranslations("module");

  return (
    <div className="pointer-events-none fixed right-0 top-0 z-30 flex h-full flex-col items-center justify-center gap-3 pr-3">
      {/* Help / Manual button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onToggleManual}
            className={cn(
              "pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full",
              "cosmic-panel shadow-lg transition-all duration-200",
              "hover:scale-110 hover:shadow-xl",
              manualOpen
                ? "ring-2 ring-primary/60 bg-primary/10"
                : "bg-card/80"
            )}
            aria-label={t("sideManualTooltip")}
          >
            <HelpCircle
              className={cn(
                "h-5 w-5 transition-colors",
                manualOpen ? "text-primary" : "text-muted-foreground"
              )}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>{t("sideManualTooltip")}</p>
        </TooltipContent>
      </Tooltip>

      {/* Chat / Module Assistant button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onToggleChat}
            className={cn(
              "pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full",
              "cosmic-panel shadow-lg transition-all duration-200",
              "hover:scale-110 hover:shadow-xl",
              chatOpen
                ? "ring-2 ring-primary/60 bg-primary/10"
                : "bg-card/80"
            )}
            aria-label={t("sideChatTooltip")}
          >
            <MessageCircle
              className={cn(
                "h-5 w-5 transition-colors",
                chatOpen ? "text-primary" : "text-muted-foreground"
              )}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>{t("sideChatTooltip")}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
