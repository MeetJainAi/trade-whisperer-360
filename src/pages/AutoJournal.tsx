
import { useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const AutoJournal = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: journals, isLoading: journalsLoading } = useQuery({
    queryKey: ['journals', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('journals')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!journalsLoading && journals && journals.length > 0) {
      navigate('/journals');
    }
  }, [journals, journalsLoading, navigate]);

  if (journalsLoading) {
    return (
        <div className="flex items-center justify-center h-screen bg-slate-50">
            <div className="text-center">
                <p className="text-lg text-slate-600">Loading your trading journal...</p>
            </div>
        </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-50 text-center p-8">
        <h2 className="text-2xl font-bold mb-4">No Journals Found</h2>
        <p className="text-slate-600 mb-6 max-w-md">You need to create a journal before you can upload trades. Journals help you organize sessions from different accounts or strategies.</p>
        <Link to="/journals">
            <Button>Go to Journals to Get Started</Button>
        </Link>
    </div>
  );
};

export default AutoJournal;
