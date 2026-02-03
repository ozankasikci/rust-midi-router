import { InputHTMLAttributes, forwardRef } from "react";
import "./ui.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: "sm" | "md" | "lg";
  state?: "default" | "learning" | "error";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ inputSize = "md", state = "default", className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`ui-input ui-input--${inputSize} ui-input--${state} ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
