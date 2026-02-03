import { SelectHTMLAttributes, forwardRef } from "react";
import "./ui.css";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: "sm" | "md" | "lg";
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ size = "md", className = "", children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={`ui-select ui-select--${size} ${className}`}
        {...props}
      >
        {children}
      </select>
    );
  }
);

Select.displayName = "Select";
