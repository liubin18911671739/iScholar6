/**
 * Projects List (/projects)
 *
 * Functionality:
 * - Lists active (non-archived) local projects as clickable cards.
 * - Opens the new-project wizard dialog and shows remote load errors with retry.
 * - Navigates to a project's topic page when a card is selected.
 * - Renders loading and empty states.
 *
 * Notes:
 * - Data comes from the useLocalProjects hook over IndexedDB.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Plus, FolderKanban } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLocalProjects } from "@/lib/local/hooks";
import { WizardDialog } from "@/components/projects/wizard-dialog";
import { RemoteLoadError } from "@/components/collaborative/remote-load-error";

/** Project list view with wizard entry point and empty/loading/error states. */
export default function ProjectsPage() {
  const router = useRouter();
  const t = useTranslations("projects");
  const {
    data: projectsData,
    error: projectsError,
    refetch,
  } = useLocalProjects();
  const [wizardOpen, setWizardOpen] = useState(false);

  // Never call .filter on a non-array (remote/local edge payloads).
  const projects = Array.isArray(projectsData) ? projectsData : [];
  const projectsLoading = projectsData === undefined && !projectsError;
  const activeProjects = projects.filter((p) => p.status !== "archived");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button data-testid="new-project" onClick={() => setWizardOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("newProject")}
        </Button>
      </div>

      <WizardDialog open={wizardOpen} onOpenChange={setWizardOpen} />

      <RemoteLoadError error={projectsError} onRetry={refetch} />

      {projectsError ? null : activeProjects.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeProjects.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => router.push(`/projects/${project.id}/topic`)}
            >
              <CardContent className="pt-6">
                <h3 className="font-semibold">{project.name}</h3>
                {project.discipline && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {project.discipline}
                  </p>
                )}
                {project.goal && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                    {project.goal}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {t("updatedAt", {
                    date: new Date(project.updatedAt).toLocaleDateString(),
                  })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : projectsLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">加载中…</div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">{t("noProjects")}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t("noProjectsHint")}
          </p>
        </div>
      )}
    </div>
  );
}
