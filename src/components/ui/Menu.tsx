import { ReactNode, useRef, useEffect } from "react";
import "./ui.css";

export interface MenuProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  anchorRef?: React.RefObject<HTMLElement | null>;
  align?: "left" | "right";
}

export function Menu({ open, onClose, children, align = "right" }: MenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className={`ui-menu ui-menu--${align}`}
    >
      {children}
    </div>
  );
}

export interface MenuItemProps {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function MenuItem({ icon, children, onClick, danger = false, disabled = false }: MenuItemProps) {
  return (
    <button
      className={`ui-menu-item ${danger ? "ui-menu-item--danger" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <span className="ui-menu-item-icon">{icon}</span>}
      {children}
    </button>
  );
}
