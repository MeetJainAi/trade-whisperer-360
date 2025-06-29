import { cn } from '@/lib/utils';

interface JournalStatsCardProps {
  label: string;
  value: string;
  isPositive?: boolean;
}

const JournalStatsCard = ({ 
  label, 
  value, 
  isPositive = true 
}: JournalStatsCardProps) => {
  return (
    <div className="text-center p-2 rounded-lg bg-white shadow">
      <p className="text-xs text-slate-600 mb-1">{label}</p>
      <p className={cn("text-sm font-bold", 
        isPositive ? "text-green-600" : "text-red-600"
      )}>
        {value}
      </p>
    </div>
  );
};

export default JournalStatsCard;