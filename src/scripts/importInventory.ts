import { Command } from 'commander';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import { db } from '../config/firebase';
import { inventoryImportRowSchema, InventoryImportRow } from '../validators/inventoryImportRow.zod';
import * as admin from 'firebase-admin';

const program = new Command();

program
    .option('--file <path>', 'Path to the Excel file', 'inventorydata.xlsx')
    .option('--sheet <name>', 'Name of the sheet to import', 'Extracting General Information ')
    .option('--dryRun <boolean>', 'Dry run mode (default: true)', 'true')
    .option('--strict <boolean>', 'Strict mode: abort if any validation fails (default: false)', 'false')
    .option('--onDuplicate <mode>', 'Duplicate handling (skip|update|upsert|error, default: skip)', 'skip')
    .option('--commitBatchSize <number>', 'Commit batch size (default: 400)', '400')
    .option('--logFile <path>', 'Path to save the import report (default: importReport.json)', 'importReport.json')
    .option('--createdBy <string>', 'User ID of the importer', 'import-script')
    .parse(process.argv);

const options = program.opts();

const REQUIRED_HEADERS = [
    'Category',
    'Name',
    'SKU',
    'In Stock',
    'Purchase price',
    'Freight & Duty',
    'Total Cost',
    'Markup %',
    'IRD ((Selling Price)',
];

interface ImportReport {
    fileName: string;
    sheetName: string;
    timestamp: string;
    totalRowsRead: number;
    rowsAfterMerge: number;
    validCount: number;
    invalidCount: number;
    createdCount: number;
    updatedCount: number;
    skippedExistingCount: number;
    mergedCount: number;
    failures: any[];
    merges: any[];
}

async function runImport() {
    const filePath = options.file;
    const dryRun = options.dryRun === 'true';
    const strict = options.strict === 'true';
    const onDuplicate = options.onDuplicate;
    const commitBatchSize = parseInt(options.commitBatchSize, 10);
    const createdBy = options.createdBy;

    const report: ImportReport = {
        fileName: path.basename(filePath),
        sheetName: options.sheet || '',
        timestamp: new Date().toISOString(),
        totalRowsRead: 0,
        rowsAfterMerge: 0,
        validCount: 0,
        invalidCount: 0,
        createdCount: 0,
        updatedCount: 0,
        skippedExistingCount: 0,
        mergedCount: 0,
        failures: [],
        merges: [],
    };

    try {
        // --- STEP 1: Read Excel & Map Headers ---
        console.log(`Step 1: Reading Excel file: ${filePath}`);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);

        const sheet = workbook.getWorksheet(options.sheet) || workbook.worksheets[0];
        if (!sheet) {
            throw new Error(`Sheet "${options.sheet}" not found in ${filePath}`);
        }
        report.sheetName = sheet.name;

        const headerRow = sheet.getRow(1);
        const headers: string[] = [];
        headerRow.eachCell((cell) => {
            headers.push(String(cell.value).trim());
        });

        const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
        if (missing.length > 0) {
            throw new Error(`Missing required headers: ${missing.join(', ')}`);
        }

        const headerIndices: Record<string, number> = {};
        headers.forEach((h, i) => {
            headerIndices[h] = i + 1;
        });

        // --- STEP 2: Normalize + Parse + Validate Rows ---
        console.log('Step 2: Normalizing, Parsing, and Validating Rows');
        const validatedRows: (InventoryImportRow & { rowNumber: number })[] = [];

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip headers
            report.totalRowsRead++;

            const rowData = {
                category: row.getCell(headerIndices['Category']).value,
                name: row.getCell(headerIndices['Name']).value,
                rawSku: row.getCell(headerIndices['SKU']).value,
                inStock: row.getCell(headerIndices['In Stock']).value,
                purchasePrice: row.getCell(headerIndices['Purchase price']).value,
                freightDuty: row.getCell(headerIndices['Freight & Duty']).value,
                totalCost: row.getCell(headerIndices['Total Cost']).value,
                markupPercent: row.getCell(headerIndices['Markup %']).value,
                sellingPriceIRD: row.getCell(headerIndices['IRD ((Selling Price)']).value,
            };

            const result = inventoryImportRowSchema.safeParse(rowData);
            if (!result.success) {
                report.invalidCount++;
                const failure = {
                    rowNumber,
                    rawSku: rowData.rawSku,
                    reason: result.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join('; '),
                    rawRowSnapshot: rowData,
                };
                report.failures.push(failure);
                if (strict) throw new Error(`Strict mode: aborting at row ${rowNumber}.`);
                return;
            }

            report.validCount++;
            validatedRows.push({ ...result.data, rowNumber });
        });

        // --- STEP 3: Merge File-Duplicates ---
        console.log('Step 3: Merging File-Duplicates');
        const skuMap: Map<string, InventoryImportRow & { sourceRows: number[] }> = new Map();

        for (const row of validatedRows) {
            const sku = row.sku!;
            if (skuMap.has(sku)) {
                const existing = skuMap.get(sku)!;
                existing.sourceRows.push(row.rowNumber);

                // Merge logic: Sum stock, last non-null for others
                existing.inStock += row.inStock;
                if (row.category !== 'Uncategorized') existing.category = row.category;
                if (row.name) existing.name = row.name;
                if (row.purchasePrice !== null) existing.purchasePrice = row.purchasePrice;
                if (row.freightDuty !== null) existing.freightDuty = row.freightDuty;
                if (row.totalCost !== null) existing.totalCost = row.totalCost;
                if (row.markupPercent !== null) existing.markupPercent = row.markupPercent;
                if (row.sellingPriceIRD !== null) existing.sellingPriceIRD = row.sellingPriceIRD;

                report.mergedCount++;
            } else {
                skuMap.set(sku, { ...row, sourceRows: [row.rowNumber] });
            }
        }
        report.rowsAfterMerge = skuMap.size;
        report.merges = Array.from(skuMap.values())
            .filter(d => d.sourceRows.length > 1)
            .map(d => ({ sku: d.sku, mergedRowNumbers: d.sourceRows, finalStock: d.inStock }));

        // --- STEP 4: Fetch Existing Firestore SKUs ---
        console.log('Step 4: Fetching Existing Firestore SKUs');
        const skus = Array.from(skuMap.keys());
        const existingDocs: Map<string, { id: string, data: any }> = new Map();
        const inventoryCollection = db.collection('inventoryItems');

        for (let i = 0; i < skus.length; i += 10) {
            const chunk = skus.slice(i, i + 10);
            const snapshot = await inventoryCollection.where('sku', 'in', chunk).get();
            snapshot.forEach(doc => {
                existingDocs.set(doc.data().sku, { id: doc.id, data: doc.data() });
            });
        }

        // --- STEP 5: Apply onDuplicate Policy & STEP 6: Batch Write ---
        console.log(`Step 5 & 6: Applying ${onDuplicate} policy and ${dryRun ? 'Drafting' : 'Executing'} Batch Writes`);
        let batch = db.batch();
        let batchCount = 0;

        for (const [sku, rowData] of skuMap.entries()) {
            const existing = existingDocs.get(sku);
            let action: 'create' | 'update' | 'skip' | 'error' = existing ? 'update' : 'create';

            if (existing) {
                if (onDuplicate === 'skip') action = 'skip';
                else if (onDuplicate === 'error') throw new Error(`Duplicate SKU exists in Firestore: ${sku}`);
                else if (onDuplicate === 'update' || onDuplicate === 'upsert') action = 'update';
            }

            if (action === 'skip') {
                report.skippedExistingCount++;
                continue;
            }

            const docRef = existing ? inventoryCollection.doc(existing.id) : inventoryCollection.doc();
            const finalDoc: any = {
                category: rowData.category,
                name: rowData.name,
                sku: rowData.sku,
                inStock: rowData.inStock,
                purchasePrice: rowData.purchasePrice,
                freightDuty: rowData.freightDuty,
                totalCost: rowData.totalCost,
                markupPercent: rowData.markupPercent,
                sellingPriceIRD: rowData.sellingPriceIRD,
                isActive: true,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                createdBy: createdBy,
                source: {
                    fileName: report.fileName,
                    sheetName: report.sheetName,
                    rows: rowData.sourceRows
                }
            };

            if (action === 'create') {
                const docRef = inventoryCollection.doc();
                finalDoc.createdAt = admin.firestore.FieldValue.serverTimestamp();
                if (!dryRun) batch.set(docRef, finalDoc);
                report.createdCount++;
            } else if (existing) {
                const docRef = inventoryCollection.doc(existing.id);
                if (!dryRun) batch.update(docRef, finalDoc);
                report.updatedCount++;
            }

            batchCount++;
            if (batchCount >= commitBatchSize) {
                if (!dryRun) await batch.commit();
                batch = db.batch();
                batchCount = 0;
            }
        }

        if (batchCount > 0 && !dryRun) {
            await batch.commit();
        }

        console.log('Import Finished Successfully.');
    } catch (error: any) {
        console.error('Fatal Error:', error.message);
        report.failures.push({ fatal: true, message: error.message });
    } finally {
        // --- STEP 7: Produce Report ---
        fs.writeFileSync(options.logFile, JSON.stringify(report, null, 2));
        console.log(`Report generated: ${options.logFile}`);
        console.table({
            Read: report.totalRowsRead,
            Valid: report.validCount,
            Merged: report.mergedCount,
            Final: report.rowsAfterMerge,
            Created: report.createdCount,
            Updated: report.updatedCount,
            Skipped: report.skippedExistingCount,
            Failed: report.invalidCount
        });
    }
}

runImport();
