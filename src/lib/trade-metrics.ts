import { Tables } from '@/integrations/supabase/types';

type Trade = Partial<Tables<'trades'>>;

export const calculateMetrics = (trades: Trade[]) => {
    const total_trades = trades.length;
    if (total_trades === 0) {
        return {
            total_pnl: 0,
            total_trades: 0,
            win_rate: 0,
            avg_win: 0,
            avg_loss: 0,
            max_drawdown: 0,
            equity_curve: [],
            time_data: [],
            profit_factor: 0,
            trades_by_day: [],
            trades_by_symbol: [],
            largest_win: 0,
            largest_loss: 0,
            max_win_streak: 0,
            max_loss_streak: 0,
            expectancy: 0,
            reward_risk_ratio: 0,
        };
    }

    let total_pnl = 0;
    const winning_trades_pnl: number[] = [];
    const losing_trades_pnl: number[] = [];
    const equity_curve_data = [];
    let cumulative_pnl = 0;
    let peak_equity = 0;
    let max_drawdown = 0;

    let largest_win = 0;
    let largest_loss = 0;
    let current_win_streak = 0;
    let max_win_streak = 0;
    let current_loss_streak = 0;
    let max_loss_streak = 0;

    const trades_by_time: { [key: string]: { time: string; trades: number; pnl: number } } = {};
    const trades_by_day: { [key: string]: { day: string; trades: number; pnl: number } } = {};
    const trades_by_symbol: { [key: string]: { symbol: string; trades: number; pnl: number } } = {};

    // Psychological pattern tracking
    let consecutive_losses = 0;
    let revenge_trading_incidents = 0;
    let oversize_after_wins = 0;
    let profit_taking_speed = [];
    let loss_holding_time = [];

    trades.sort((a: Trade, b: Trade) => new Date(a.datetime!).getTime() - new Date(b.datetime!).getTime()).forEach((trade: Trade, index: number) => {
        const pnl = trade.pnl ?? 0;
        const qty = trade.qty ?? 0;
        total_pnl += pnl;
        cumulative_pnl += pnl;

        if (pnl > 0) {
            winning_trades_pnl.push(pnl);
            if (pnl > largest_win) largest_win = pnl;
            current_win_streak++;
            consecutive_losses = 0;
            current_loss_streak = 0;
            
            // Check for oversizing after wins
            if (current_win_streak >= 2 && index > 0) {
                const prevQty = trades[index - 1]?.qty ?? 0;
                if (qty > prevQty * 1.5) {
                    oversize_after_wins++;
                }
            }
        } else if (pnl < 0) {
            losing_trades_pnl.push(pnl);
            if (pnl < largest_loss) largest_loss = pnl;
            consecutive_losses++;
            current_loss_streak++;
            current_win_streak = 0;
            
            // Check for revenge trading (increasing size after losses)
            if (consecutive_losses >= 2 && index < trades.length - 1) {
                const nextTrade = trades[index + 1];
                const nextQty = nextTrade?.qty ?? 0;
                if (nextQty > qty * 1.3) {
                    revenge_trading_incidents++;
                }
            }
        } else {
            current_win_streak = 0;
            current_loss_streak = 0;
        }
        
        if (current_win_streak > max_win_streak) max_win_streak = current_win_streak;
        if (current_loss_streak > max_loss_streak) max_loss_streak = current_loss_streak;

        equity_curve_data.push({ 
            trade: index + 1, 
            cumulative: cumulative_pnl,
            drawdown: peak_equity - cumulative_pnl,
            win_streak: current_win_streak,
            loss_streak: current_loss_streak
        });

        if (cumulative_pnl > peak_equity) {
            peak_equity = cumulative_pnl;
        }
        const drawdown = peak_equity - cumulative_pnl;
        if (drawdown > max_drawdown) {
            max_drawdown = drawdown;
        }

        const date = new Date(trade.datetime!);

        // Enhanced time data with psychological context
        const time_key = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        if (!trades_by_time[time_key]) {
            trades_by_time[time_key] = { time: time_key, trades: 0, pnl: 0 };
        }
        trades_by_time[time_key].trades += 1;
        trades_by_time[time_key].pnl += pnl;

        // Day of week data with emotional patterns
        const day_key = date.toLocaleString('en-US', { weekday: 'long' });
        if (!trades_by_day[day_key]) {
            trades_by_day[day_key] = { day: day_key, trades: 0, pnl: 0 };
        }
        trades_by_day[day_key].trades += 1;
        trades_by_day[day_key].pnl += pnl;
        
        // Symbol data with performance analysis
        const symbol_key = trade.symbol;
        if (symbol_key) {
            if (!trades_by_symbol[symbol_key]) {
                trades_by_symbol[symbol_key] = { symbol: symbol_key, trades: 0, pnl: 0 };
            }
            trades_by_symbol[symbol_key].trades += 1;
            trades_by_symbol[symbol_key].pnl += pnl;
        }
    });

    // Calculate enhanced metrics
    const win_rate = total_trades > 0 ? (winning_trades_pnl.length / total_trades) * 100 : 0;
    const avg_win = winning_trades_pnl.length > 0 ? winning_trades_pnl.reduce((a, b) => a + b, 0) / winning_trades_pnl.length : 0;
    const avg_loss = losing_trades_pnl.length > 0 ? losing_trades_pnl.reduce((a, b) => a + b, 0) / losing_trades_pnl.length : 0;

    const gross_profit = winning_trades_pnl.reduce((a,b) => a + b, 0);
    const gross_loss = Math.abs(losing_trades_pnl.reduce((a,b) => a + b, 0));
    const profit_factor = gross_loss > 0 ? gross_profit / gross_loss : (gross_profit > 0 ? 9999 : 0);

    const abs_avg_loss = Math.abs(avg_loss);
    const reward_risk_ratio = abs_avg_loss > 0 ? avg_win / abs_avg_loss : 0;
    
    const win_rate_decimal = win_rate / 100;
    const loss_rate_decimal = 1 - win_rate_decimal;
    const expectancy = (win_rate_decimal * avg_win) - (loss_rate_decimal * abs_avg_loss);

    // Enhanced time and pattern analysis
    const time_data = Object.values(trades_by_time)
        .sort((a,b) => a.time.localeCompare(b.time))
        .map(item => ({
            ...item,
            efficiency: item.trades > 0 ? item.pnl / item.trades : 0,
            risk_score: item.pnl < 0 ? Math.abs(item.pnl) / item.trades : 0
        }));
    
    const days_order = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const day_data = Object.values(trades_by_day)
        .sort((a,b) => days_order.indexOf(a.day) - days_order.indexOf(b.day))
        .map(item => ({
            ...item,
            efficiency: item.trades > 0 ? item.pnl / item.trades : 0,
            consistency: item.trades >= 3 ? 'High' : item.trades >= 1 ? 'Medium' : 'Low'
        }));
    
    const symbol_data = Object.values(trades_by_symbol)
        .sort((a,b) => b.pnl - a.pnl)
        .map(item => ({
            ...item,
            efficiency: item.trades > 0 ? item.pnl / item.trades : 0,
            edge: item.pnl > 0 ? 'Positive' : 'Negative'
        }));

    // Psychological metrics
    const psychological_score = {
        revenge_trading_risk: revenge_trading_incidents > 0 ? 'High' : 'Low',
        overconfidence_risk: oversize_after_wins > 0 ? 'High' : 'Low',
        consistency_score: max_loss_streak <= 3 ? 'Good' : max_loss_streak <= 5 ? 'Average' : 'Poor',
        discipline_score: (max_drawdown / Math.abs(total_pnl)) < 0.2 ? 'Excellent' : 'Needs Work'
    };

    return {
        total_pnl,
        total_trades,
        win_rate,
        avg_win,
        avg_loss,
        max_drawdown,
        equity_curve: equity_curve_data,
        time_data,
        profit_factor,
        trades_by_day: day_data,
        trades_by_symbol: symbol_data,
        largest_win,
        largest_loss,
        max_win_streak,
        max_loss_streak,
        expectancy,
        reward_risk_ratio,
        // Enhanced psychological insights
        psychological_patterns: {
            revenge_trading_incidents,
            oversize_after_wins,
            emotional_volatility: max_loss_streak + revenge_trading_incidents,
            discipline_score: psychological_score.discipline_score
        }
    };
};