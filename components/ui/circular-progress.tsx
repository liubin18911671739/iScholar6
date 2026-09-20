/**
 * CircularProgress UI primitive (components/ui/circular-progress.tsx)
 *
 * Functionality:
 * - Renders a self-contained SVG progress ring with a background track and a value arc.
 * - Supports an optional two-stop linear gradient and clamps value to the 0-100 range.
 *
 * Notes:
 * - Generates a random gradient id per render and transitions stroke-dashoffset in CSS.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

/** Props for CircularProgress, including value, size, stroke and gradient. */
interface CircularProgressProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  gradient?: { from: string; to: string };
  className?: string;
}

/** SVG circular progress indicator with an optional gradient stroke. */
export function CircularProgress({
  value,
  size = 48,
  strokeWidth = 4,
  gradient,
  className,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(Math.max(value, 0), 100) / 100) * circumference;
  const gradientId = `cp-grad-${Math.random().toString(36).slice(2, 8)}`;

  // Color logic when no gradient specified
  const getColor = () => {
    if (gradient) return undefined;
    if (value >= 80) return "hsl(var(--chart-3))"; // teal/green
    if (value >= 50) return "hsl(var(--chart-2))"; // yellow/amber
    return "hsl(var(--muted-foreground))"; // gray
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-label={`Progress: ${value}%`}
    >
      {gradient && (
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={gradient.from} />
            <stop offset="100%" stopColor={gradient.to} />
          </linearGradient>
        </defs>
      )}

      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(var(--border))"
        strokeWidth={strokeWidth}
      />

      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={gradient ? `url(#${gradientId})` : (getColor() ?? "hsl(var(--primary))")}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />

      {/* Center text */}
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground text-[10px] font-semibold"
        style={{ fontSize: size * 0.22 }}
      >
        {value}%
      </text>
    </svg>
  );
}
