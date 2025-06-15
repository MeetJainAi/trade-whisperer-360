
import { Upload } from 'lucide-react';

interface UploadPlaceholderProps {
  loadingMessage: string;
  onFileUpload: (file: File) => void;
}

const UploadPlaceholder = ({ loadingMessage, onFileUpload }: UploadPlaceholderProps) => {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
    // Reset file input to allow re-uploading the same file
    if (event.target) {
        event.target.value = '';
    }
  };

  return (
    <label className="block cursor-pointer border-2 border-dashed border-slate-300 rounded-lg p-12 text-center transition-colors hover:border-blue-400">
      <input
        type="file"
        onChange={handleFileChange}
        className="hidden"
        accept=".csv, text/csv"
        disabled={!!loadingMessage}
      />
      <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
      <p className="text-lg font-medium text-slate-700 mb-2">
        {loadingMessage || 'Upload a CSV File'}
      </p>
      <p className="text-sm text-slate-500">
        Click to select your trade history file.
      </p>
    </label>
  );
};

export default UploadPlaceholder;

