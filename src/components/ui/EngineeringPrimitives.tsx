import React, { ChangeEvent } from 'react';

export interface EngineeringButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'destructive' | 'ghost' | 'secondary';
  size?: 'sm' | 'default' | 'icon';
}

export const EngineeringButton = React.forwardRef<HTMLButtonElement, EngineeringButtonProps>(
  ({ children, onClick, variant = 'default', size = 'default', className = '', disabled = false, ...props }, ref) => {
    const base = 'ui-control ui-focus-ring rounded font-medium transition-colors flex items-center justify-center';
    const variants: Record<string, string> = {
      default: 'bg-[#f97316] text-white hover:bg-[#ea580c] border-[#ea580c]',
      outline: 'border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)]',
      destructive: 'bg-red-600 hover:bg-red-700 text-white border-red-700',
      ghost: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] border-transparent',
      secondary: 'bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-panel)]',
    };
    const sizes: Record<string, string> = {
      sm: 'text-xs px-2 h-7 min-h-7',
      default: 'text-sm px-3 h-8 min-h-8',
      icon: 'h-8 w-8 min-h-8 min-w-8 p-0',
    };

    return (
      <button
        ref={ref}
        onClick={onClick}
        disabled={disabled}
        className={`${base} ${variants[variant] || variants.default} ${sizes[size] || sizes.default} ${className} ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        {...props}
      >
        {children}
      </button>
    );
  }
);
EngineeringButton.displayName = 'EngineeringButton';

export interface EngineeringInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value?: string | number;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
}

export const EngineeringInput = React.forwardRef<HTMLInputElement, EngineeringInputProps>(
  ({ value, onChange, placeholder = '', type = 'text', className = '', ...props }, ref) => (
    <input
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
      className={`ui-control ui-focus-ring px-2.5 py-1 bg-[var(--surface-panel)] border border-[var(--border-default)] rounded text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] ${className}`}
      {...props}
    />
  )
);
EngineeringInput.displayName = 'EngineeringInput';

export interface EngineeringLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
}

export const EngineeringLabel = ({ children, className = '', ...props }: EngineeringLabelProps) => (
  <label className={`text-xs text-[var(--text-secondary)] ${className}`} {...props}>
    {children}
  </label>
);

export interface EngineeringBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: 'default' | 'secondary' | 'outline';
}

export const EngineeringBadge = ({ children, variant = 'secondary', className = '', ...props }: EngineeringBadgeProps) => {
  const variantStyles: Record<string, string> = {
    secondary: 'bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-default)]',
    default: 'bg-[#f97316] text-white',
    outline: 'border border-[var(--border-default)] text-[var(--text-primary)]',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variantStyles[variant] || variantStyles.secondary} ${className}`} {...props}>
      {children}
    </span>
  );
};

export interface EngineeringSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
}

export const EngineeringSeparator = ({ orientation = 'horizontal', className = '', ...props }: EngineeringSeparatorProps) => (
  <div
    className={`shrink-0 ${orientation === 'vertical' ? 'w-px h-4' : 'h-px w-full'} bg-[var(--border-default)] ${className}`}
    {...props}
  />
);

export interface EngineeringCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
}

export const EngineeringCheckbox = ({
  checked,
  onCheckedChange,
  id,
  className = '',
  disabled = false,
}: EngineeringCheckboxProps) => (
  <input
    id={id}
    type="checkbox"
    checked={checked}
    disabled={disabled}
    onChange={(e) => onCheckedChange(e.target.checked)}
    className={`ui-focus-ring w-4 h-4 rounded border-[var(--border-strong)] bg-[var(--surface-panel)] text-[#f97316] focus:ring-[#f97316] cursor-pointer ${className}`}
  />
);

export const Triangle = ({ size, className, fill }: { size: number; className?: string; fill?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill || 'none'}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 20h18L12 4z" />
  </svg>
);

export const Resizer = ({
  onMouseDown,
  orientation = 'vertical',
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  orientation?: 'vertical' | 'horizontal';
}) => (
  <div
    onMouseDown={onMouseDown}
    className={`shrink-0 bg-transparent group transition-colors duration-200 ${
      orientation === 'vertical' ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'
    }`}
  >
    <div
      className={`bg-[var(--border-default)] group-hover:bg-[#f97316] transition-colors ${
        orientation === 'vertical' ? 'w-px h-full mx-auto' : 'h-px w-full my-auto'
      }`}
    />
  </div>
);

// Backward-compatibility aliases for seamless drop-in
export const Button = EngineeringButton;
export const Input = EngineeringInput;
export const Label = EngineeringLabel;
export const Badge = EngineeringBadge;
export const Separator = EngineeringSeparator;
export const Checkbox = EngineeringCheckbox;
