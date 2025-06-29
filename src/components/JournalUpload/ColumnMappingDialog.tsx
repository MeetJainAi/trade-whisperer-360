import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Info, Zap } from 'lucide-react';

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
  { key: 'buyFillId', label: 'Buy Fill ID', description: 'Unique identifier for buy execution (helps prevent duplicates)' },
  { key: 'sellFillId', label: 'Sell Fill ID', description: 'Unique identifier for sell execution (helps prevent duplicates)' },
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
  const [mapping, setMapping] = useState<ColumnMapping>({});

  // Initialize mapping with fallbacks for required fields
  useEffect(() => {
    const enhancedMapping = { ...initialMapping };
    
    // Ensure all required fields have some mapping
    REQUIRED_FIELDS.forEach(field => {
      if (!enhancedMapping[field.key]) {
        // Try to find a reasonable fallback
        const possibleHeaders = csvHeaders.filter(header => {
          const lowerHeader = header.toLowerCase();
          const fieldKey = field.key.toLowerCase();
          
          if (fieldKey === 'datetime') {
            return lowerHeader.includes('date') || lowerHeader.includes('time') || lowerHeader.includes('timestamp');
          }
          if (fieldKey === 'symbol') {
            return lowerHeader.includes('symbol') || lowerHeader.includes('ticker') || lowerHeader.includes('instrument');
          }
          if (fieldKey === 'qty') {
            return lowerHeader.includes('qty') || lowerHeader.includes('quantity') || lowerHeader.includes('size') || lowerHeader.includes('amount');
          }
          if (fieldKey === 'pnl') {
            return lowerHeader.includes('pnl') || lowerHeader.includes('p&l') || lowerHeader.includes('profit') || lowerHeader.includes('loss');
          }
          
          return lowerHeader.includes(fieldKey);
        });
        
        if (possibleHeaders.length > 0) {
          enhancedMapping[field.key] = possibleHeaders[0];
        }
      }
    });
    
    setMapping(enhancedMapping);
  }, [initialMapping, csvHeaders]);

  const handleMappingChange = (field: string, csvHeader: string) => {
    setMapping(prev => ({
      ...prev,
      [field]: csvHeader === 'none' ? '' : csvHeader
    }));
  };

  const getPreviewValue = (field: string): string => {
    const header = mapping[field];
    if (!header || !csvData[0]) return 'No data';
    const value = csvData[0][header];
    if (value === null || value === undefined) return 'Empty';
    return value.toString().slice(0, 50);
  };

  const isValid = () => {
    const missingFields = REQUIRED_FIELDS.filter(field => !mapping[field.key] || mapping[field.key] === '');
    console.log('Validation check:', { mapping, missingFields });
    return missingFields.length === 0;
  };

  const getMissingRequiredFields = () => {
    return REQUIRED_FIELDS.filter(field => !mapping[field.key] || mapping[field.key] === '');
  };

  const getFieldStatus = (field: string, isRequired: boolean) => {
    const mapped = mapping[field] && mapping[field] !== '';
    if (isRequired) {
      return mapped ? 'success' : 'error';
    }
    return mapped ? 'success' : 'optional';
  };

  const hasFillIds = () => {
    return (mapping['buyFillId'] && mapping['buyFillId'] !== '') || 
           (mapping['sellFillId'] && mapping['sellFillId'] !== '');
  };

  const missingRequired = getMissingRequiredFields();
  const canProcess = isValid();

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
          {hasFillIds() && (
            <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-green-600" />
                <p className="text-sm text-green-800 font-medium">
                  Excellent! Fill IDs detected - this will provide more accurate duplicate detection.
                </p>
              </div>
            </div>
          )}
          {missingRequired.length > 0 && (
            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800 font-medium">
                Missing required mappings: {missingRequired.map(f => f.label).join(', ')}
              </p>
            </div>
          )}
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
                const isMapped = mapping[field.key] && mapping[field.key] !== '';
                
                return (
                  <div key={field.key} className={`grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-3 border rounded-lg ${
                    !isMapped ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'
                  }`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <Label className="font-medium">{field.label}</Label>
                        {status === 'success' ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                        <Badge variant={isMapped ? 'default' : 'destructive'} className="text-xs">
                          Required
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600">{field.description}</p>
                    </div>
                    <Select
                      value={mapping[field.key] || 'none'}
                      onValueChange={(value) => handleMappingChange(field.key, value)}
                    >
                      <SelectTrigger className={!isMapped ? 'border-red-300' : 'border-green-300'}>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- Select a column --</SelectItem>
                        {csvHeaders.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-sm">
                      <Label className="text-xs text-slate-500">Preview:</Label>
                      <div className="mt-1 p-2 bg-white rounded text-xs font-mono border">
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
                const isMapped = mapping[field.key] && mapping[field.key] !== '';
                const isFillId = field.key.includes('FillId');
                
                return (
                  <div key={field.key} className={`grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-3 border rounded-lg ${
                    isMapped && isFillId ? 'border-green-200 bg-green-50' : ''
                  }`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <Label className="font-medium">{field.label}</Label>
                        {status === 'success' && (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                        {isFillId && isMapped && (
                          <Zap className="w-4 h-4 text-green-600" />
                        )}
                        <Badge variant={isFillId && isMapped ? 'default' : 'outline'} className="text-xs">
                          {isFillId ? 'Anti-Duplicate' : 'Optional'}
                        </Badge>
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
                      <div className="mt-1 p-2 bg-slate-50 rounded text-xs font-mono border">
                        {getPreviewValue(field.key)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={() => onConfirm(mapping)} 
            disabled={!canProcess}
            className={`${
              canProcess 
                ? 'bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600' 
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            {canProcess ? `Process ${csvData.length} Rows` : `Map Required Fields First`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ColumnMappingDialog;