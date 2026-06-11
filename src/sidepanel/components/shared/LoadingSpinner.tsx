import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

export function LoadingSpinner({ size = 'md', text }: LoadingSpinnerProps) {
  const sizeMap = { sm: 16, md: 24, lg: 32 };

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8">
      <Loader2 size={sizeMap[size]} className="animate-spin text-primary-500" />
      {text && <p className="text-sm text-gray-500">{text}</p>}
    </div>
  );
}
