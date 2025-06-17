
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import UploadCard from '@/components/JournalUpload/UploadCard';

interface JournalUploadSectionProps {
  journal: Tables<'journals'>;
  onUploadComplete?: () => void;
}

const JournalUploadSection = ({ journal, onUploadComplete }: JournalUploadSectionProps) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="icon" onClick={() => navigate('/journals')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{journal.name}</h1>
          <p className="text-muted-foreground">Upload your trade history file to get started.</p>
        </div>
      </div>
      <div className="flex-grow flex items-center justify-center">
        <UploadCard journal={journal} onUploadComplete={onUploadComplete} />
      </div>
    </div>
  );
};

export default JournalUploadSection;
