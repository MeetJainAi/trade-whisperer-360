
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

    trades.sort((a: Trade, b: Trade) => new Date(a.datetime!).getTime() - new Date(b.datetime!).getTime()).forEach((trade: Trade, index: number) => {
        const pnl = trade.pnl ?? 0;
        total_pnl += pnl;
        cumulative_pnl += pnl;

        if (pnl > 0) {
            winning_trades_pnl.push(pnl);
            if (pnl > largest_win) largest_win = pnl;
            current_win_streak++;
            current_loss_streak = 0;
        } else if (pnl < 0) {
            losing_trades_pnl.push(pnl);
            if (pnl < largest_loss) largest_loss = pnl;
            current_loss_streak++;
            current_win_streak = 0;
        } else {
            current_win_streak = 0;
            current_loss_streak = 0;
        }
        
        if (current_win_streak > max_win_streak) max_win_streak = current_win_streak;
        if (current_loss_streak > max_loss_streak) max_loss_streak = current_loss_streak;

        equity_curve_data.push({ trade: index + 1, cumulative: cumulative_pnl });

        if (cumulative_pnl > peak_equity) {
            peak_equity = cumulative_pnl;
        }
        const drawdown = peak_equity - cumulative_pnl;
        if (drawdown > max_drawdown) {
            max_drawdown = drawdown;
        }

        const date = new Date(trade.datetime!);

        // Time data
        const time_key = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        if (!trades_by_time[time_key]) {
            trades_by_time[time_key] = { time: time_key, trades: 0, pnl: 0 };
        }
        trades_by_time[time_key].trades += 1;
        trades_by_time[time_key].pnl += pnl;

        // Day of week data
        const day_key = date.toLocaleString('en-US', { weekday: 'long' });
        if (!trades_by_day[day_key]) {
            trades_by_day[day_key] = { day: day_key, trades: 0, pnl: 0 };
        }
        trades_by_day[day_key].trades += 1;
        trades_by_day[day_key].pnl += pnl;
        
        // Symbol data
        const symbol_key = trade.symbol;
        if (symbol_key) {
            if (!trades_by_symbol[symbol_key]) {
                trades_by_symbol[symbol_key] = { symbol: symbol_key, trades: 0, pnl: 0 };
            }
            trades_by_symbol[symbol_key].trades += 1;
            trades_by_symbol[symbol_key].pnl += pnl;
        }
    });

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

    const time_data = Object.values(trades_by_time).sort((a,b) => a.time.localeCompare(b.time));
    
    const days_order = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const day_data = Object.values(trades_by_day).sort((a,b) => days_order.indexOf(a.day) - days_order.indexOf(b.day));
    const symbol_data = Object.values(trades_by_symbol).sort((a,b) => a.symbol.localeCompare(b.symbol));

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
    };
}
