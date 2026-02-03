import { ReactNode, useEffect, useRef } from "react";
import "./ui.css";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function Dialog({ open, onClose, title, children, actions }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      // Focus the first input in the dialog
      const input = dialogRef.current?.querySelector("input");
      input?.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="ui-dialog-backdrop" onClick={onClose} />
      <div className="ui-dialog" ref={dialogRef}>
        {title && <div className="ui-dialog-header">{title}</div>}
        <div className="ui-dialog-content">{children}</div>
        {actions && <div className="ui-dialog-actions">{actions}</div>}
      </div>
    </>
  );
}
