import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek, addMonths, subMonths } from 'date-fns';

type TradeSessionWithTrades = Tables<'trade_sessions'> & { trades: Tables<'trades'>[] };

interface CalendarViewProps {
  sessions: TradeSessionWithTrades[];
  onSessionClick: (sessionId: string) => void;
}

const CalendarView = ({ sessions, onSessionClick }: CalendarViewProps) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  // Get calendar data
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  
  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd
  });

  // Group sessions by date
  const sessionsByDate = useMemo(() => {
    const grouped: Record<string, TradeSessionWithTrades[]> = {};
    
    sessions.forEach(session => {
      const dateKey = format(new Date(session.created_at), 'yyyy-MM-dd');
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(session);
    });
    
    return grouped;
  }, [sessions]);

  const getDayData = (day: Date) => {
    const dateKey = format(day, 'yyyy-MM-dd');
    const daySessions = sessionsByDate[dateKey] || [];
    
    const totalPnL = daySessions.reduce((sum, session) => sum + (session.total_pnl || 0), 0);
    const totalTrades = daySessions.reduce((sum, session) => sum + (session.total_trades || 0), 0);
    
    return {
      sessions: daySessions,
      totalPnL,
      totalTrades
    };
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1));
  };

  const isCurrentMonth = (day: Date) => {
    return day.getMonth() === currentDate.getMonth();
  };

  const isToday = (day: Date) => {
    return isSameDay(day, new Date());
  };

  return (
    <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-600" />
            Trading Calendar
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigateMonth('prev')}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-lg font-semibold text-slate-800 min-w-[200px] text-center">
              {format(currentDate, 'MMMM yyyy')}
            </span>
            <Button variant="outline" size="sm" onClick={() => navigateMonth('next')}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="p-2 text-center text-sm font-semibold text-slate-600">
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, index) => {
            const dayData = getDayData(day);
            const isOtherMonth = !isCurrentMonth(day);
            const isTodayDate = isToday(day);
            
            return (
              <div
                key={index}
                className={`min-h-[100px] p-2 border rounded-lg transition-all duration-200 ${
                  isOtherMonth 
                    ? 'bg-slate-50 text-slate-400' 
                    : isTodayDate
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-white hover:bg-slate-50'
                } ${dayData.sessions.length > 0 ? 'cursor-pointer hover:shadow-md' : ''}`}
                onClick={() => {
                  if (dayData.sessions.length === 1) {
                    onSessionClick(dayData.sessions[0].id);
                  }
                }}
              >
                {/* Date Number */}
                <div className="flex justify-between items-start mb-1">
                  <span className={`text-sm font-medium ${
                    isTodayDate ? 'text-blue-600 font-bold' : 
                    isOtherMonth ? 'text-slate-400' : 'text-slate-700'
                  }`}>
                    {format(day, 'd')}
                  </span>
                  {dayData.totalTrades > 0 && (
                    <Badge variant="outline" className="text-xs px-1 py-0">
                      {dayData.totalTrades}
                    </Badge>
                  )}
                </div>
                
                {/* P&L Display */}
                {dayData.totalPnL !== 0 && (
                  <div className="mb-1">
                    <div className={`text-xs font-semibold flex items-center ${
                      dayData.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {dayData.totalPnL >= 0 ? (
                        <TrendingUp className="w-3 h-3 mr-1" />
                      ) : (
                        <TrendingDown className="w-3 h-3 mr-1" />
                      )}
                      {dayData.totalPnL >= 0 ? '+' : ''}${dayData.totalPnL.toFixed(0)}
                    </div>
                  </div>
                )}
                
                {/* Sessions Indicators */}
                {dayData.sessions.length > 0 && (
                  <div className="space-y-1">
                    {dayData.sessions.slice(0, 2).map((session, idx) => (
                      <div
                        key={session.id}
                        className={`h-1.5 rounded-full ${
                          (session.total_pnl || 0) >= 0 ? 'bg-green-400' : 'bg-red-400'
                        }`}
                      />
                    ))}
                    {dayData.sessions.length > 2 && (
                      <div className="text-xs text-slate-500 text-center">
                        +{dayData.sessions.length - 2} more
                      </div>
                    )}
                  </div>
                )}
                
                {/* Multiple Sessions - Show as clickable list */}
                {dayData.sessions.length > 1 && (
                  <div className="mt-1 space-y-1">
                    {dayData.sessions.map((session) => (
                      <button
                        key={session.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSessionClick(session.id);
                        }}
                        className="w-full text-left text-xs p-1 rounded bg-slate-100 hover:bg-slate-200 transition-colors"
                      >
                        {format(new Date(session.created_at), 'HH:mm')}
                        <span className={`ml-1 font-semibold ${
                          (session.total_pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {(session.total_pnl || 0) >= 0 ? '+' : ''}${(session.total_pnl || 0).toFixed(0)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Legend */}
        <div className="mt-4 flex items-center justify-center space-x-6 text-xs text-slate-600">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-green-400 rounded-full"></div>
            <span>Profitable Day</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-red-400 rounded-full"></div>
            <span>Loss Day</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-blue-200 rounded border border-blue-300"></div>
            <span>Today</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CalendarView;