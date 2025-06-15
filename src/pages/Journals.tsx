
import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { PlusCircle, Trash2 } from 'lucide-react';

type Journal = Tables<'journals'>;

const Journals = () => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

    const { data: journals, isLoading } = useQuery<Journal[]>({
        queryKey: ['journals', user?.id],
        queryFn: async () => {
            if (!user) return [];
            const { data, error } = await supabase
                .from('journals')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },
        enabled: !!user,
    });

    const createJournalMutation = useMutation({
        mutationFn: async (newJournal: TablesInsert<'journals'>) => {
            if (!user) throw new Error("User not authenticated");
            const { data, error } = await supabase
                .from('journals')
                .insert({ ...newJournal, user_id: user.id })
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
        const formData = new FormData(event.currentTarget);
        const accountSize = formData.get('account_size');
        const newJournal: TablesInsert<'journals'> = {
            name: formData.get('name') as string,
            description: formData.get('description') as string,
            prop_firm: formData.get('prop_firm') as string,
            account_size: accountSize ? Number(accountSize) : null,
            broker: formData.get('broker') as string,
        };
        createJournalMutation.mutate(newJournal);
    };
    
    return (
        <div className="container mx-auto p-4 md:p-8">
            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <CardTitle>My Journals</CardTitle>
                            <CardDescription>Organize your trades by account, strategy, or prop firm.</CardDescription>
                        </div>
                        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                            <DialogTrigger asChild>
                                <Button>
                                    <PlusCircle className="mr-2 h-4 w-4" /> Create New Journal
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Create a New Journal</DialogTitle>
                                </DialogHeader>
                                <form onSubmit={handleCreateJournal} className="space-y-4">
                                    <div>
                                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Journal Name</label>
                                        <Input id="name" name="name" required placeholder="e.g. My Apex Account"/>
                                    </div>
                                    <div>
                                        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                        <Textarea id="description" name="description" placeholder="e.g. 50k Performance Account"/>
                                    </div>
                                    <div>
                                        <label htmlFor="prop_firm" className="block text-sm font-medium text-gray-700 mb-1">Prop Firm</label>
                                        <Input id="prop_firm" name="prop_firm" placeholder="e.g. Apex Trader Funding"/>
                                    </div>
                                    <div>
                                        <label htmlFor="account_size" className="block text-sm font-medium text-gray-700 mb-1">Account Size ($)</label>
                                        <Input id="account_size" name="account_size" type="number" step="any" placeholder="e.g. 50000"/>
                                    </div>
                                    <div>
                                        <label htmlFor="broker" className="block text-sm font-medium text-gray-700 mb-1">Broker</label>
                                        <Input id="broker" name="broker" placeholder="e.g. Tradovate"/>
                                    </div>
                                    <DialogFooter>
                                        <Button type="submit" disabled={createJournalMutation.isPending}>
                                            {createJournalMutation.isPending ? 'Creating...' : 'Create Journal'}
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <p>Loading journals...</p>
                    ) : journals && journals.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Prop Firm</TableHead>
                                    <TableHead>Account Size</TableHead>
                                    <TableHead>Broker</TableHead>
                                    <TableHead className="text-right"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {journals.map((journal) => (
                                    <TableRow key={journal.id}>
                                        <TableCell className="font-medium">{journal.name}</TableCell>
                                        <TableCell>{journal.prop_firm || '-'}</TableCell>
                                        <TableCell>{journal.account_size ? `$${journal.account_size.toLocaleString()}`: '-'}</TableCell>
                                        <TableCell>{journal.broker || '-'}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => deleteJournalMutation.mutate(journal.id)} disabled={deleteJournalMutation.isPending}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center py-10 border-2 border-dashed rounded-lg">
                            <h3 className="text-lg font-semibold">No Journals Yet</h3>
                            <p className="text-muted-foreground mt-1">Get started by creating your first journal.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Journals;
