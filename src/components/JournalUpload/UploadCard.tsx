import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tables } from '@/integrations/supabase/types';
import { useCreateSampleData } from '@/hooks/useCreateSampleData';
import UploadPlaceholder from './UploadPlaceholder';
import SampleDataButton from './SampleDataButton';
import ColumnMappingDialog from './ColumnMappingDialog';
import { useProcessCsv } from '@/hooks/useProcessCsv';

interface UploadCardProps {
  journal: Tables<'journals'>;
  onUploadComplete?: () => void;
}

const UploadCard = ({ journal, onUploadComplete }: UploadCardProps) => {
  const { createSampleData, loadingMessage: sampleDataLoadingMessage } = useCreateSampleData(journal);
  const { 
    processCsv, 
    loadingMessage: csvLoadingMessage, 
    columnMapping, 
    processCSVWithMapping,
    csvHeaders,
    csvData 
  } = useProcessCsv(journal);

  const handleFileUpload = (file: File) => {
    processCsv(file);
  };

  const handleSampleDataCreated = () => {
    createSampleData();
    if (onUploadComplete) {
      onUploadComplete();
    }
  };

  const handleMappingConfirm = (finalMapping: any) => {
    processCSVWithMapping(finalMapping);
    if (onUploadComplete) {
      onUploadComplete();
    }
  };
  
  const loadingMessage = sampleDataLoadingMessage || csvLoadingMessage;

  return (
    <>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Upload Trades</CardTitle>
          <CardDescription>Upload a CSV file to analyze your trades or try sample data.</CardDescription>
        </CardHeader>
        <CardContent>
          <UploadPlaceholder onFileUpload={handleFileUpload} loadingMessage={loadingMessage} />
          <SampleDataButton onClick={handleSampleDataCreated} loadingMessage={loadingMessage} />
        </CardContent>
      </Card>

      {columnMapping && csvData && (
        <ColumnMappingDialog
          isOpen={true}
          onClose={() => {}}
          onConfirm={handleMappingConfirm}
          initialMapping={columnMapping}
          csvHeaders={csvHeaders}
          csvData={csvData}
        />
      )}
    </>
  );
};

export default UploadCard;