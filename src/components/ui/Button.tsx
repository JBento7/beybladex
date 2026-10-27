import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Shared button styles. "primary" = the main action of a section (red);
// "secondary" = everything else; "accent" = league highlight (yellow).
// Min height 48px (44px for "sm"), 10px radius, Inter 14/600.
export type ButtonVariant = "primary" | "secondary" | "accent" | "ghost";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-ctl text-small font-semibold transition-colors duration-150 " +
  "disabled:opacity-60 disabled:pointer-events-none aria-disabled:opacity-60 aria-disabled:pointer-events-none";
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-red text-white hover:bg-brand-red-hover",
  secondary: "bg-field text-fg border border-line hover:bg-hover",
  accent: "bg-brand-yellow text-brand-ink hover:bg-brand-yellow-hover",
  ghost: "text-fg-2 hover:text-fg hover:bg-hover",
};

export function buttonClass(variant: ButtonVariant = "primary", size: "md" | "sm" = "md", extra = "") {
  return `${BASE} ${VARIANTS[variant]} ${size === "md" ? "min-h-12 px-5" : "min-h-11 px-4"} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "md" | "sm"; children: ReactNode }) {
  return (
    <button type="button" className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: "md" | "sm"; children: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
