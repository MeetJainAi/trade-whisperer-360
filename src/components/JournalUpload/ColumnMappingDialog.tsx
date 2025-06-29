import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

interface ColumnMapping {
  [key: string]: string;
}

interface ColumnMappingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mapping: ColumnMapping) => void;
  initialMapping: ColumnMapping;
  csvHeaders: string[];
  csvData: any[];
}

const REQUIRED_FIELDS = [
  { key: 'datetime', label: 'Date/Time', description: 'When the trade was executed' },
  { key: 'symbol', label: 'Symbol', description: 'Stock ticker or instrument' },
  { key: 'qty', label: 'Quantity', description: 'Number of shares/contracts' },
  { key: 'pnl', label: 'P&L', description: 'Profit or Loss amount' }
];

const OPTIONAL_FIELDS = [
  { key: 'side', label: 'Side', description: 'BUY or SELL' },
  { key: 'price', label: 'Price', description: 'Execution price' },
  { key: 'buyPrice', label: 'Buy Price', description: 'Entry/Buy price' },
  { key: 'sellPrice', label: 'Sell Price', description: 'Exit/Sell price' },
  { key: 'notes', label: 'Notes', description: 'Trade notes or comments' },
  { key: 'strategy', label: 'Strategy', description: 'Trading strategy used' },
  { key: 'tags', label: 'Tags', description: 'Trade categories or labels' }
];

const ColumnMappingDialog = ({
  isOpen,
  onClose,
  onConfirm,
  initialMapping,
  csvHeaders,
  csvData
}: ColumnMappingDialogProps) => {
  const [mapping, setMapping] = useState<ColumnMapping>(initialMapping);

  const handleMappingChange = (field: string, csvHeader: string) => {
    setMapping(prev => ({
      ...prev,
      [field]: csvHeader === 'none' ? '' : csvHeader
    }));
  };

  const getPreviewValue = (field: string): string => {
    const header = mapping[field];
    if (!header || !csvData[0]) return 'No data';
    return csvData[0][header]?.toString() || 'Empty';
  };

  const isValid = () => {
    return REQUIRED_FIELDS.every(field => mapping[field] && mapping[field] !== '');
  };

  const getFieldStatus = (field: string, isRequired: boolean) => {
    const mapped = mapping[field] && mapping[field] !== '';
    if (isRequired) {
      return mapped ? 'success' : 'error';
    }
    return mapped ? 'success' : 'optional';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-600" />
            Confirm Column Mapping
          </DialogTitle>
          <p className="text-sm text-slate-600">
            Review and adjust how your CSV columns map to our trade fields. Required fields must be mapped.
          </p>
        </DialogHeader>

        <div className="space-y-6">
          {/* Required Fields */}
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              Required Fields
            </h3>
            <div className="grid gap-4">
              {REQUIRED_FIELDS.map((field) => {
                const status = getFieldStatus(field.key, true);
                return (
                  <div key={field.key} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-3 border rounded-lg">
                    <div>
                      <div className="flex items-center gap-2">
                        <Label className="font-medium">{field.label}</Label>
                        {status === 'success' ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                      <p className="text-xs text-slate-600">{field.description}</p>
                    </div>
                    <Select
                      value={mapping[field.key] || 'none'}
                      onValueChange={(value) => handleMappingChange(field.key, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- No mapping --</SelectItem>
                        {csvHeaders.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-sm">
                      <Label className="text-xs text-slate-500">Preview:</Label>
                      <div className="mt-1 p-2 bg-slate-50 rounded text-xs font-mono">
                        {getPreviewValue(field.key)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Optional Fields */}
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Optional Fields
            </h3>
            <div className="grid gap-4">
              {OPTIONAL_FIELDS.map((field) => {
                const status = getFieldStatus(field.key, false);
                return (
                  <div key={field.key} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-3 border rounded-lg">
                    <div>
                      <div className="flex items-center gap-2">
                        <Label className="font-medium">{field.label}</Label>
                        {status === 'success' && (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                        <Badge variant="outline" className="text-xs">Optional</Badge>
                      </div>
                      <p className="text-xs text-slate-600">{field.description}</p>
                    </div>
                    <Select
                      value={mapping[field.key] || 'none'}
                      onValueChange={(value) => handleMappingChange(field.key, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- No mapping --</SelectItem>
                        {csvHeaders.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-sm">
                      <Label className="text-xs text-slate-500">Preview:</Label>
                      <div className="mt-1 p-2 bg-slate-50 rounded text-xs font-mono">
                        {getPreviewValue(field.key)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={() => onConfirm(mapping)} 
            disabled={!isValid()}
            className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600"
          >
            Process {csvData.length} Rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ColumnMappingDialog;