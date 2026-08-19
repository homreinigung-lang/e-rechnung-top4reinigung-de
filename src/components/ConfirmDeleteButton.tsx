import * as React from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";

type Props = {
  title: string;
  description: string;
  onConfirm: () => void;
  confirmLabel?: string;
  disabled?: boolean;
  size?: "icon" | "sm" | "default";
  variant?: "ghost" | "outline" | "destructive";
  iconClassName?: string;
  className?: string;
  ariaLabel?: string;
  children?: React.ReactNode;
};

/** Papierkorb-Button mit AlertDialog-Bestätigung vor dem endgültigen Löschen. */
export function ConfirmDeleteButton({
  title,
  description,
  onConfirm,
  confirmLabel = "Löschen",
  disabled,
  size = "icon",
  variant = "ghost",
  iconClassName = "size-4 text-destructive",
  className,
  ariaLabel = "Löschen",
  children,
}: Props) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          disabled={disabled}
          aria-label={ariaLabel}
          className={className}
        >
          {children ?? <Trash2 className={iconClassName} />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
