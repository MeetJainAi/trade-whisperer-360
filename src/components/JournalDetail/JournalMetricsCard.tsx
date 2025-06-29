import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface JournalMetricsCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  description: string;
  isPositive?: boolean;
  format?: 'currency' | 'percent' | 'ratio' | 'number';
  valueColor?: string;
}

const JournalMetricsCard = ({ 
  title, 
  value, 
  icon: Icon, 
  description,
  isPositive,
  format = 'currency',
  valueColor
}: JournalMetricsCardProps) => {
  
  const formatValue = () => {
    if (format === 'currency') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    } else if (format === 'percent') {
      return `${value.toFixed(1)}%`;
    } else if (format === 'ratio') {
      return `${value.toFixed(2)}:1`;
    }
    return value.toString();
  };
  
  const getValueColor = () => {
    if (valueColor) return valueColor;
    
    if (isPositive !== undefined) {
      return isPositive ? 'text-green-600' : 'text-red-600';
    }
    
    if (format === 'currency' || format === 'number') {
      return value >= 0 ? 'text-green-600' : 'text-red-600';
    }
    
    return 'text-slate-800';
  };
  
  return (
    <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm hover:shadow-xl transition-all duration-300">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-600 mb-1">{title}</p>
            <p className={`text-3xl font-bold ${getValueColor()}`}>
              {isPositive !== undefined && format === 'currency' && value >= 0 ? '+' : ''}
              {formatValue()}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {description}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-blue-100 to-green-100 flex items-center justify-center">
            <Icon className="h-6 w-6 text-blue-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default JournalMetricsCard;