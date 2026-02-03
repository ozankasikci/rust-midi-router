import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";
import "./ui.css";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon: ReactNode;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = "default", size = "md", icon, active = false, className = "", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`ui-icon-btn ui-icon-btn--${variant} ui-icon-btn--${size} ${active ? "ui-icon-btn--active" : ""} ${className}`}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";
