import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

const REQUIRED_COLUMNS = [
    { id: 'datetime', label: 'Date/Time' },
    { id: 'symbol', label: 'Symbol' },
    { id: 'side', label: 'Side (Buy/Sell)' },
    { id: 'qty', label: 'Quantity' },
    { id: 'price', label: 'Price' },
    { id: 'pnl', label: 'Profit & Loss (P&L)' },
];

const OPTIONAL_COLUMNS = [
    { id: 'notes', label: 'Notes' },
];

interface ColumnMappingProps {
    csvHeaders: string[];
    csvData: any[];
    onMapComplete: (mappedData: any[]) => void;
    onCancel: () => void;
    isProcessing: boolean;
    initialMapping?: { [key: string]: string };
}

const cleanAndParseFloat = (value: any): number | null => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    if (typeof value === 'number') {
        return value;
    }
    let stringValue = String(value).trim();

    // Handle parentheses for negative numbers e.g. (50.00)
    if (stringValue.startsWith('(') && stringValue.endsWith(')')) {
        stringValue = '-' + stringValue.substring(1, stringValue.length - 1);
    }
    
    // Remove characters that are not digits, decimal point, or minus sign.
    // This is a bit aggressive but handles many formats like "$1,234.56"
    const cleanedString = stringValue.replace(/[^0-9.-]/g, '');
    
    if (cleanedString === '' || cleanedString === '-' || cleanedString === '.') {
        return null;
    }

    const number = parseFloat(cleanedString);
    
    return isNaN(number) ? null : number;
};

const ColumnMapping = ({ csvHeaders, csvData, onMapComplete, onCancel, isProcessing, initialMapping }: ColumnMappingProps) => {
    const [mapping, setMapping] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        let newMapping: { [key: string]: string } = {};

        if (initialMapping && Object.keys(initialMapping).length > 0) {
            newMapping = { ...initialMapping };
        } else {
            // Fallback to basic keyword matching
            const allColumns = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];
            
            allColumns.forEach(col => {
                const commonNames = [col.id, col.label.toLowerCase(), col.label.replace(/ /g, '').toLowerCase()];
                if (col.id === 'pnl') commonNames.push('profit', 'loss', 'p/l', 'profit/loss');
                if (col.id === 'qty') commonNames.push('quantity');
                if (col.id === 'datetime') commonNames.push('date');

                for (const header of csvHeaders) {
                    if (commonNames.includes(header.toLowerCase().trim())) {
                        newMapping[col.id] = header;
                        break;
                    }
                }
            });
        }
        setMapping(newMapping);
    }, [csvHeaders, initialMapping]);

    const handleMappingChange = (requiredColId: string, csvHeader: string) => {
        setMapping(prev => ({ ...prev, [requiredColId]: csvHeader }));
    };

    const handleSubmit = () => {
        const missingColumns = REQUIRED_COLUMNS.filter(col => !mapping[col.id]);
        if (missingColumns.length > 0) {
            toast({
                title: "Mapping Incomplete",
                description: `Please map the following fields: ${missingColumns.map(c => c.label).join(', ')}`,
                variant: "destructive"
            });
            return;
        }

        const mappedData = csvData.map(row => {
            const newRow: { [key: string]: any } = {};
            [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].forEach(col => {
                if (mapping[col.id] && row[mapping[col.id]] !== undefined) {
                    const rawValue = row[mapping[col.id]];
                    if (['pnl', 'qty', 'price'].includes(col.id)) {
                        newRow[col.id] = cleanAndParseFloat(rawValue);
                    } else {
                        newRow[col.id] = rawValue;
                    }
                }
            });
             if (!newRow.notes) newRow.notes = '';
            return newRow;
        });
        
        const validatedData = mappedData.filter((trade, index) => {
            const originalRow = csvData[index];
            const isValid = trade.pnl !== null && trade.qty !== null && trade.price !== null && trade.datetime && String(trade.datetime).trim() !== '';
            if (!isValid) {
                console.warn("Skipping invalid trade row:", { original: originalRow, mapped: trade });
            }
            return isValid;
        });

        if (validatedData.length === 0) {
            toast({
                title: "No Valid Trades Found",
                description: "After processing, no valid trades could be found. Please check your file for missing or invalid values in required columns.",
                variant: "destructive"
            });
            return;
        }

        if (validatedData.length < mappedData.length) {
            toast({
                title: "Some trades skipped",
                description: `${mappedData.length - validatedData.length} rows were skipped due to missing or invalid data in required columns (like P&L, Qty, Price, or Date/Time).`,
            });
        }
        
        onMapComplete(validatedData);
    };

    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle>Map Your CSV Columns</CardTitle>
                    <CardDescription>
                        We've detected the columns from your file. Please match them to the required trade attributes so we can analyze them correctly. We've tried to guess the mapping for you.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div>
                        <h3 className="text-lg font-medium mb-4 text-slate-800">Required Fields</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                            {REQUIRED_COLUMNS.map(col => (
                                <div key={col.id} className="space-y-2">
                                    <Label htmlFor={col.id}>{col.label} <span className="text-red-500">*</span></Label>
                                    <Select
                                        value={mapping[col.id] || ''}
                                        onValueChange={value => handleMappingChange(col.id, value)}
                                    >
                                        <SelectTrigger id={col.id}>
                                            <SelectValue placeholder="Select a column..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {csvHeaders.map(header => (
                                                <SelectItem key={header} value={header}>{header}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="border-t pt-6">
                        <h3 className="text-lg font-medium mb-4 text-slate-800">Optional Fields</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                             {OPTIONAL_COLUMNS.map(col => (
                                <div key={col.id} className="space-y-2">
                                    <Label htmlFor={col.id}>{col.label}</Label>
                                    <Select
                                        value={mapping[col.id] || ''}
                                        onValueChange={value => handleMappingChange(col.id, value)}
                                    >
                                        <SelectTrigger id={col.id}>
                                            <SelectValue placeholder="Select a column..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="--skip--">-- Not Available --</SelectItem>
                                            {csvHeaders.map(header => (
                                                <SelectItem key={header} value={header}>{header}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end space-x-4">
                    <Button variant="outline" onClick={onCancel} disabled={isProcessing}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isProcessing}>
                        {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Analyze Trades
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
};

export default ColumnMapping;
