import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { PlusCircle, Trash2, Settings, BarChart3, ChevronRight, TrendingUp, ArrowUpRight, FileSpreadsheet, PencilLine } from 'lucide-react';

type Journal = Tables<'journals'>;

const Journals = () => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const navigate = useNavigate();

    const { data: journals, isLoading } = useQuery<(Journal & { summary?: any })[]>({
        queryKey: ['journals', user?.id],
        queryFn: async () => {
            if (!user) return [];
            
            try {
                // First get all journals
                const { data: journalsData, error } = await supabase
                    .from('journals')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });
                
                if (error) throw error;
                
                // For each journal, fetch a summary using our new function
                const journalsWithSummary = await Promise.all(
                    (journalsData || []).map(async (journal) => {
                        try {
                            const { data: summaryData, error: summaryError } = await supabase
                                .rpc('get_journal_summary', { p_journal_id: journal.id });
                            
                            if (summaryError) {
                                console.error('Error fetching journal summary:', summaryError);
                                return { ...journal, summary: null };
                            }
                            
                            return { ...journal, summary: summaryData };
                        } catch (err) {
                            console.error('Failed to fetch summary for journal:', journal.id, err);
                            return { ...journal, summary: null };
                        }
                    })
                );
                
                return journalsWithSummary || [];
            } catch (err) {
                console.error('Error fetching journals:', err);
                throw err;
            }
        },
        enabled: !!user,
    });

    const createJournalMutation = useMutation({
        mutationFn: async (newJournal: TablesInsert<'journals'>) => {
            const { data, error } = await supabase
                .from('journals')
                .insert(newJournal)
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['journals', user?.id] });
            toast({ title: "Success!", description: "New journal created." });
            setIsCreateDialogOpen(false);
        },
        onError: (error: any) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        },
    });

    const deleteJournalMutation = useMutation({
        mutationFn: async (journalId: string) => {
            const { error } = await supabase.from('journals').delete().eq('id', journalId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['journals', user?.id] });
            toast({ title: "Success!", description: "Journal deleted." });
        },
        onError: (error: any) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        },
    });

    const handleCreateJournal = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!user) {
            toast({ title: "Error", description: "You must be logged in to create a journal.", variant: "destructive" });
            return;
        }
        const formData = new FormData(event.currentTarget);
        const accountSize = formData.get('account_size');
        const newJournal: TablesInsert<'journals'> = {
            user_id: user.id,
            name: formData.get('name') as string,
            description: formData.get('description') as string,
            prop_firm: formData.get('prop_firm') as string,
            account_size: accountSize ? Number(accountSize) : null,
            broker: formData.get('broker') as string,
        };
        createJournalMutation.mutate(newJournal);
    };
    
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
            <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-green-500 flex items-center justify-center">
                                <BarChart3 className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-800">Trading Journals</h1>
                                <p className="text-sm text-slate-600">Organize and analyze your trades by account</p>
                            </div>
                        </div>
                        <Button
                            onClick={() => navigate('/dashboard')}
                            variant="outline"
                            className="border-slate-300"
                        >
                            Dashboard
                        </Button>
                    </div>
                </div>
            </header>
            
            <div className="container mx-auto p-4 md:p-8">
                <div className="mb-6 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">My Journals</h2>
                        <p className="text-slate-600">Create separate journals for different accounts or trading strategies</p>
                    </div>
                    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600">
                                <PlusCircle className="mr-2 h-4 w-4" /> Create New Journal
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[525px]">
                            <DialogHeader>
                                <DialogTitle>Create a New Journal</DialogTitle>
                                <DialogDescription>
                                    Set up a new trading journal to track your performance.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleCreateJournal} className="space-y-4">
                                <div>
                                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Journal Name*</label>
                                    <Input id="name" name="name" required placeholder="e.g. Apex Trader 50K Challenge" className="bg-white"/>
                                </div>
                                <div>
                                    <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                    <Textarea id="description" name="description" placeholder="e.g. My prop firm account for futures trading" className="bg-white"/>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="prop_firm" className="block text-sm font-medium text-gray-700 mb-1">Prop Firm</label>
                                        <Input id="prop_firm" name="prop_firm" placeholder="e.g. Apex Trader Funding" className="bg-white"/>
                                    </div>
                                    <div>
                                        <label htmlFor="account_size" className="block text-sm font-medium text-gray-700 mb-1">Account Size ($)</label>
                                        <Input id="account_size" name="account_size" type="number" step="any" placeholder="e.g. 50000" className="bg-white"/>
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="broker" className="block text-sm font-medium text-gray-700 mb-1">Broker</label>
                                    <Input id="broker" name="broker" placeholder="e.g. Tradovate" className="bg-white"/>
                                </div>
                                <DialogFooter className="mt-6">
                                    <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={createJournalMutation.isPending} className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600">
                                        {createJournalMutation.isPending ? 'Creating...' : 'Create Journal'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
                
                <div className="mb-8">
                    <div className="bg-white border rounded-lg p-4 shadow-sm">
                        <h3 className="font-medium mb-4 flex items-center text-blue-700">
                            <Info className="w-4 h-4 mr-2" />
                            How to Use Trading Journals
                        </h3>
                        <div className="grid md:grid-cols-3 gap-4 text-sm">
                            <div className="space-y-2">
                                <div className="flex items-center">
                                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mr-2 font-bold">1</div>
                                    <p className="font-medium text-slate-800">Create separate journals</p>
                                </div>
                                <p className="text-slate-600 pl-8">Use different journals for separate trading accounts, strategies, or time periods</p>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center">
                                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mr-2 font-bold">2</div>
                                    <p className="font-medium text-slate-800">Record your trades</p>
                                </div>
                                <p className="text-slate-600 pl-8">Upload CSV files from your broker or manually add individual trades</p>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center">
                                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mr-2 font-bold">3</div>
                                    <p className="font-medium text-slate-800">Analyze performance</p>
                                </div>
                                <p className="text-slate-600 pl-8">Review metrics, identify patterns, and improve your trading strategy</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                {isLoading ? (
                    <div className="grid grid-cols-1 gap-4 animate-pulse">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-48 bg-slate-200 rounded-lg"></div>
                        ))}
                    </div>
                ) : journals && journals.length > 0 ? (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {journals.map((journal) => (
                            <Card key={journal.id} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer" onClick={() => navigate(`/journals/${journal.id}`)}>
                                <CardHeader className="pb-2 border-b">
                                    <div className="flex justify-between items-center">
                                        <CardTitle className="text-lg font-bold text-slate-800">{journal.name}</CardTitle>
                                        <Button 
                                            variant="ghost" 
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (confirm("Are you sure you want to delete this journal? All associated sessions and trades will be permanently removed.")) {
                                                    deleteJournalMutation.mutate(journal.id);
                                                }
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4 text-slate-500" />
                                        </Button>
                                    </div>
                                    <CardDescription className="line-clamp-1">
                                        {journal.description || 'No description provided'}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="pt-4">
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <p className="text-xs text-slate-500">Prop Firm</p>
                                            <p className="font-medium text-slate-700">{journal.prop_firm || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500">Account Size</p>
                                            <p className="font-medium text-slate-700">
                                                {journal.account_size ? `$${journal.account_size.toLocaleString()}` : 'N/A'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500">Broker</p>
                                            <p className="font-medium text-slate-700">{journal.broker || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500">Created</p>
                                            <p className="font-medium text-slate-700">
                                                {new Date(journal.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    {journal.summary && (
                                        <div className="bg-slate-50 p-3 rounded-lg mb-4">
                                            <div className="grid grid-cols-3 gap-2 text-center">
                                                <div>
                                                    <p className="text-xs text-slate-500">Total P&L</p>
                                                    <p className={`text-sm font-semibold ${journal.summary.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {journal.summary.total_pnl >= 0 ? '+' : ''}{journal.summary.total_pnl?.toFixed(2)}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500">Win Rate</p>
                                                    <p className="text-sm font-semibold text-blue-600">{journal.summary.win_rate?.toFixed(1)}%</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500">Trades</p>
                                                    <p className="text-sm font-semibold text-slate-700">{journal.summary.total_trades}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    
                                    <div className="flex justify-between items-center mt-2">
                                        <div className="flex space-x-1">
                                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                <FileSpreadsheet className="w-3 h-3 mr-1" />
                                                Import
                                            </Badge>
                                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                                <PencilLine className="w-3 h-3 mr-1" />
                                                Manual
                                            </Badge>
                                        </div>
                                        <Button 
                                            size="sm"
                                            variant="ghost"
                                            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 -mr-2"
                                        >
                                            View Details
                                            <ArrowUpRight className="w-3 h-3 ml-1" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        
                        {/* Add New Journal Card */}
                        <Card 
                            className="border-2 border-dashed border-slate-300 hover:border-blue-400 transition-colors shadow-md hover:shadow-lg cursor-pointer flex flex-col items-center justify-center p-6 text-center"
                            onClick={() => setIsCreateDialogOpen(true)}
                        >
                            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                                <PlusCircle className="w-8 h-8 text-blue-600" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-800 mb-2">Create New Journal</h3>
                            <p className="text-sm text-slate-600">
                                Add another account or trading strategy
                            </p>
                        </Card>
                    </div>
                ) : (
                    <Card className="border-0 shadow-lg">
                        <CardContent className="pt-6">
                            <div className="text-center py-10">
                                <div className="w-16 h-16 rounded-full bg-blue-100 mx-auto mb-4 flex items-center justify-center">
                                    <BarChart3 className="h-8 w-8 text-blue-600" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 mb-2">No Journals Yet</h3>
                                <p className="text-slate-600 mb-6 max-w-md mx-auto">
                                    Create your first journal to start tracking your trading performance across different accounts or strategies.
                                </p>
                                <Button 
                                    onClick={() => setIsCreateDialogOpen(true)}
                                    className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600"
                                >
                                    <PlusCircle className="mr-2 h-4 w-4" /> Create Your First Journal
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
};

export default Journals;