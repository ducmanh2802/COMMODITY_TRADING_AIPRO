import { useRef, type ReactNode } from 'react';
import { useFocusTrap } from '../../shared/hooks/useFocusTrap';

interface Props {
  label: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}

/** Modal dialog wrapper: role/aria-modal, focus trap, Escape closes, focus returns to the trigger. Mount only while open. */
export function TrapDialog({ label, className, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, { onEscape: onClose });
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label} className={className}>
      {children}
    </div>
  );
}
