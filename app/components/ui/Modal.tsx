"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import "./Modal.css";

type ModalSize = "sm" | "md" | "lg" | "xl";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  titleId?: string;
  ariaLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  role?: "dialog" | "alertdialog";
  backdropClassName?: string;
  modalClassName?: string;
  bodyClassName?: string;
  closeLabel?: string;
};

// Beberapa modal bisa terbuka bersamaan (mis. form + dialog AI).
// Kunci scroll baru dilepas saat modal terakhir ditutup.
let openCount = 0;
let previousOverflow = "";

export default function Modal({
  open,
  onClose,
  title,
  titleId,
  ariaLabel,
  children,
  footer,
  size = "md",
  role = "dialog",
  backdropClassName,
  modalClassName,
  bodyClassName,
  closeLabel = "Tutup",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;

    if (openCount === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.body.classList.add("app-modal-open");
    }
    openCount += 1;

    return () => {
      openCount -= 1;
      if (openCount === 0) {
        document.body.style.overflow = previousOverflow;
        document.body.classList.remove("app-modal-open");
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const ariaProps = titleId
    ? { "aria-labelledby": titleId }
    : ariaLabel
      ? { "aria-label": ariaLabel }
      : {};

  return (
    <div
      className={`app-modal-backdrop${backdropClassName ? ` ${backdropClassName}` : ""}`}
      onClick={onClose}
    >
      <div
        className={`app-modal app-modal-${size}${modalClassName ? ` ${modalClassName}` : ""}`}
        role={role}
        aria-modal="true"
        {...ariaProps}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="app-modal-head">
          <h3 id={titleId}>{title}</h3>
          <button type="button" onClick={onClose} aria-label={closeLabel}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className={`app-modal-body${bodyClassName ? ` ${bodyClassName}` : ""}`}>
          {children}
        </div>

        {footer && <div className="app-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
