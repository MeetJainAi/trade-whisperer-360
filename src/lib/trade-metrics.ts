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
        };
    }

    let total_pnl = 0;
    const winning_trades_pnl: number[] = [];
    const losing_trades_pnl: number[] = [];
    const equity_curve_data = [];
    let cumulative_pnl = 0;
    let peak_equity = 0;
    let max_drawdown = 0;

    const trades_by_time: { [key: string]: { time: string; trades: number; pnl: number } } = {};

    trades.sort((a: Trade, b: Trade) => new Date(a.datetime!).getTime() - new Date(b.datetime!).getTime()).forEach((trade: Trade, index: number) => {
        const pnl = trade.pnl ?? 0;
        total_pnl += pnl;
        cumulative_pnl += pnl;

        if (pnl > 0) {
            winning_trades_pnl.push(pnl);
        } else if (pnl < 0) {
            losing_trades_pnl.push(pnl);
        }

        equity_curve_data.push({ trade: index + 1, cumulative: cumulative_pnl });

        if (cumulative_pnl > peak_equity) {
            peak_equity = cumulative_pnl;
        }
        const drawdown = peak_equity - cumulative_pnl;
        if (drawdown > max_drawdown) {
            max_drawdown = drawdown;
        }

        const date = new Date(trade.datetime!);
        const time_key = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        if (!trades_by_time[time_key]) {
            trades_by_time[time_key] = { time: time_key, trades: 0, pnl: 0 };
        }
        trades_by_time[time_key].trades += 1;
        trades_by_time[time_key].pnl += pnl;
    });

    const win_rate = total_trades > 0 ? (winning_trades_pnl.length / total_trades) * 100 : 0;
    const avg_win = winning_trades_pnl.length > 0 ? winning_trades_pnl.reduce((a, b) => a + b, 0) / winning_trades_pnl.length : 0;
    const avg_loss = losing_trades_pnl.length > 0 ? losing_trades_pnl.reduce((a, b) => a + b, 0) / losing_trades_pnl.length : 0;

    const time_data = Object.values(trades_by_time).sort((a,b) => a.time.localeCompare(b.time));

    return {
        total_pnl,
        total_trades,
        win_rate,
        avg_win,
        avg_loss,
        max_drawdown,
        equity_curve: equity_curve_data,
        time_data,
    };
}
