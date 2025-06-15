
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tables } from '@/integrations/supabase/types';
import { useCreateSampleData } from '@/hooks/useCreateSampleData';
import UploadPlaceholder from './UploadPlaceholder';
import SampleDataButton from './SampleDataButton';

interface UploadCardProps {
  journal: Tables<'journals'>;
}

const UploadCard = ({ journal }: UploadCardProps) => {
  const { createSampleData, loadingMessage } = useCreateSampleData(journal);

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Upload Trades</CardTitle>
        <CardDescription>Upload a CSV file to analyze your trades or try sample data.</CardDescription>
      </CardHeader>
      <CardContent>
        <UploadPlaceholder loadingMessage={loadingMessage} />
        <SampleDataButton onClick={createSampleData} loadingMessage={loadingMessage} />
      </CardContent>
    </Card>
  );
};

export default UploadCard;
