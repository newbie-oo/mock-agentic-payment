import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
const styles = cva("button", {
  variants: {
    variant: { default: "primary", outline: "outline", ghost: "ghost" },
  },
  defaultVariants: { variant: "default" },
});
export function Button({
  variant,
  className = "",
  ...props
}: ComponentProps<"button"> & VariantProps<typeof styles>) {
  return <button className={styles({ variant, className })} {...props} />;
}
