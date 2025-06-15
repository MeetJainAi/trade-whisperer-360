
import { Upload } from 'lucide-react';

interface UploadPlaceholderProps {
  loadingMessage: string;
}

const UploadPlaceholder = ({ loadingMessage }: UploadPlaceholderProps) => (
  <div className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center hover:border-blue-400 transition-colors">
    <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
    <p className="text-lg font-medium text-slate-700 mb-2">
      {loadingMessage || 'CSV upload coming soon...'}
    </p>
    <p className="text-sm text-slate-500">
      For now, try the sample data below.
    </p>
  </div>
);

export default UploadPlaceholder;
