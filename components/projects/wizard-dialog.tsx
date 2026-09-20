/**
 * Wizard Dialog (components/projects/wizard-dialog.tsx)
 *
 * Functionality:
 * - Drives a 4-step modal for creating a project: discipline category, research method, direction, and name.
 * - Tracks wizard answers and step state, validates each step before allowing progress, and shows a summary.
 * - Persists the project through `createProject` and routes to the new project's topic module.
 *
 * Notes:
 * - Uses `WizardStep` for step transitions and resets its state when the dialog closes.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  GraduationCap,
  Microscope,
  FileText,
  BarChart3,
  GitMerge,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
} from "lucide-react";
import { createProject } from "@/lib/local/hooks";
import { WizardStep } from "./wizard-step";

// ── Types ────────────────────────────────────────────────────────

// User-selected discipline category (social or natural sciences).
type DisciplineCategory = "社科" | "自科" | null;
// User-selected research method.
type ResearchMethod = "定性" | "定量" | "混合" | null;

/** Accumulated answers collected across the wizard steps. */
interface WizardData {
  disciplineCategory: DisciplineCategory;
  researchMethod: ResearchMethod;
  researchDirection: string;
  projectName: string;
}

const TOTAL_STEPS = 4;

// Localization keys for the per-step labels, in step order.
const STEP_LABELS = ["step1Label", "step2Label", "step3Label", "step4Label"] as const;

// ── Option cards ──────────────────────────────────────────────────

/** Selectable option card used by the wizard's choice steps. */
function OptionCard({
  selected,
  onClick,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cosmic-panel flex flex-col items-center gap-3 rounded-xl p-5 transition-all duration-200",
        "hover:shadow-lg hover:scale-[1.02]",
        selected
          ? "ring-2 ring-primary shadow-lg shadow-primary/10"
          : "ring-1 ring-border/50 hover:ring-border"
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full",
          selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        {icon}
      </div>
      <div className="text-center">
        <div className={cn("text-sm font-semibold", selected && "text-primary")}>
          {title}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground leading-relaxed max-w-[220px]">
          {description}
        </div>
      </div>
    </button>
  );
}

// ── Progress stepper ──────────────────────────────────────────────

/** Renders the wizard's numbered progress indicator for the active step. */
function ProgressStepper({ step }: { step: number }) {
  const t = useTranslations("wizard");

  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const idx = i + 1;
        const isActive = idx === step;
        const isDone = idx < step;
        return (
          <div key={idx} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold transition-all",
                  isDone && "bg-primary text-primary-foreground",
                  isActive && "bg-primary text-primary-foreground scale-110",
                  !isDone && !isActive && "bg-muted text-muted-foreground"
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : idx}
              </div>
              <span
                className={cn(
                  "text-[10px]",
                  isActive ? "text-foreground font-medium" : "text-muted-foreground"
                )}
              >
                {t(STEP_LABELS[i])}
              </span>
            </div>
            {idx < TOTAL_STEPS && (
              <div
                className={cn(
                  "h-px w-6 sm:w-8 mt-[-12px]",
                  idx < step ? "bg-primary" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main wizard dialog ────────────────────────────────────────────

/** Props for the project creation wizard dialog. */
interface WizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Multi-step dialog for collecting metadata and creating a project. */
export function WizardDialog({ open, onOpenChange }: WizardDialogProps) {
  const router = useRouter();
  const t = useTranslations("wizard");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [data, setData] = useState<WizardData>({
    disciplineCategory: null,
    researchMethod: null,
    researchDirection: "",
    projectName: "",
  });

  function update<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function goNext() {
    if (step < TOTAL_STEPS) setStep((s) => s + 1);
  }

  function goBack() {
    if (step > 1) setStep((s) => s - 1);
  }

  function reset() {
    setStep(1);
    setData({
      disciplineCategory: null,
      researchMethod: null,
      researchDirection: "",
      projectName: "",
    });
  }

  // Persist the new project and navigate to its topic module.
  async function handleCreate() {
    if (!data.projectName.trim()) return;
    setLoading(true);
    try {
      const disciplineLabel = [data.disciplineCategory, data.researchMethod]
        .filter(Boolean)
        .join(" · ");

      const id = await createProject({
        name: data.projectName.trim(),
        discipline: disciplineLabel || undefined,
        goal: data.researchDirection.trim() || undefined,
        metadata: {
          wizard: {
            disciplineCategory: data.disciplineCategory,
            researchMethod: data.researchMethod,
            researchDirection: data.researchDirection.trim(),
          },
        },
      });

      onOpenChange(false);
      reset();
      router.push(`/projects/${id}/topic`);
    } finally {
      setLoading(false);
    }
  }

  // ── Step content ────────────────────────────────────────────────

  // Render the content for the currently active step.
  function renderStep() {
    switch (step) {
      case 1:
        return (
          <WizardStep>
            <h3 className="text-sm font-semibold mb-4">{t("step1Title")}</h3>
            <div className="grid grid-cols-2 gap-3">
              <OptionCard
                selected={data.disciplineCategory === "社科"}
                onClick={() => update("disciplineCategory", "社科")}
                icon={<GraduationCap className="h-6 w-6" />}
                title={t("socialSciences")}
                description={t("socialSciencesDesc")}
              />
              <OptionCard
                selected={data.disciplineCategory === "自科"}
                onClick={() => update("disciplineCategory", "自科")}
                icon={<Microscope className="h-6 w-6" />}
                title={t("naturalSciences")}
                description={t("naturalSciencesDesc")}
              />
            </div>
          </WizardStep>
        );

      case 2:
        return (
          <WizardStep>
            <h3 className="text-sm font-semibold mb-4">{t("step2Title")}</h3>
            <div className="grid grid-cols-3 gap-3">
              <OptionCard
                selected={data.researchMethod === "定性"}
                onClick={() => update("researchMethod", "定性")}
                icon={<FileText className="h-6 w-6" />}
                title={t("qualitative")}
                description={t("qualitativeDesc")}
              />
              <OptionCard
                selected={data.researchMethod === "定量"}
                onClick={() => update("researchMethod", "定量")}
                icon={<BarChart3 className="h-6 w-6" />}
                title={t("quantitative")}
                description={t("quantitativeDesc")}
              />
              <OptionCard
                selected={data.researchMethod === "混合"}
                onClick={() => update("researchMethod", "混合")}
                icon={<GitMerge className="h-6 w-6" />}
                title={t("mixed")}
                description={t("mixedDesc")}
              />
            </div>
          </WizardStep>
        );

      case 3:
        return (
          <WizardStep>
            <h3 className="text-sm font-semibold mb-4">{t("step3Title")}</h3>
            <div className="space-y-2">
              <Label className="text-xs">{t("researchDirection")}</Label>
              <Textarea
                value={data.researchDirection}
                onChange={(e) => update("researchDirection", e.target.value)}
                placeholder={t("researchDirectionPlaceholder")}
                rows={5}
                className="resize-none"
              />
            </div>
          </WizardStep>
        );

      case 4:
        return (
          <WizardStep>
            <h3 className="text-sm font-semibold mb-4">{t("step4Title")}</h3>

            {/* Summary */}
            <div className="cosmic-panel mb-4 rounded-lg p-3 space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">{t("summary")}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">{t("summaryDiscipline")}</span>
                <span className="font-medium">
                  {data.disciplineCategory ?? "—"}
                </span>
                <span className="text-muted-foreground">{t("summaryMethod")}</span>
                <span className="font-medium">
                  {data.researchMethod ?? "—"}
                </span>
                {data.researchDirection && (
                  <>
                    <span className="text-muted-foreground">{t("summaryDirection")}</span>
                    <span className="font-medium line-clamp-1">
                      {data.researchDirection}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wizard-project-name" className="text-xs">
                {t("projectName")}
              </Label>
              <Input
                id="wizard-project-name"
                data-testid="project-name"
                value={data.projectName}
                onChange={(e) => update("projectName", e.target.value)}
                placeholder={t("projectNamePlaceholder")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                autoFocus
              />
            </div>
          </WizardStep>
        );

      default:
        return null;
    }
  }

  // ── Can proceed checks ──────────────────────────────────────────

  const canNext = (() => {
    switch (step) {
      case 1:
        return data.disciplineCategory !== null;
      case 2:
        return data.researchMethod !== null;
      case 3:
        return true; // optional
      case 4:
        return data.projectName.trim().length > 0;
      default:
        return false;
    }
  })();

  // ── Render ──────────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <ProgressStepper step={step} />

        <div className="min-h-[200px]">{renderStep()}</div>

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBack}
            disabled={step === 1}
            className="gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("back")}
          </Button>

          {step < TOTAL_STEPS ? (
            <Button size="sm" onClick={goNext} disabled={!canNext} className="gap-1.5">
              {t("next")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button data-testid="create-project" size="sm" onClick={handleCreate} disabled={!canNext || loading} className="gap-1.5">
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("creating")}
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  {t("create")}
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
