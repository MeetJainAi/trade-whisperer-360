
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
}

const ColumnMapping = ({ csvHeaders, csvData, onMapComplete, onCancel, isProcessing }: ColumnMappingProps) => {
    const [mapping, setMapping] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        const newMapping: { [key: string]: string } = {};
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
        setMapping(newMapping);
    }, [csvHeaders]);

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
                    newRow[col.id] = row[mapping[col.id]];
                }
            });
             if (!newRow.notes) newRow.notes = '';
            return newRow;
        });
        
        onMapComplete(mappedData);
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
