/**
 * Auth Layout (/(auth))
 *
 * Functionality:
 * - Shared layout for authentication routes such as /login.
 * - Centers auth content in a full-height, background-filled container.
 *
 * @author mrpi
 * @date 2026-09-16
 */

/** Centers authentication content within a full-screen container. */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      {children}
    </div>
  );
}
