import { Command } from 'commander';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, writeBatch, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { inventoryImportRowSchema, InventoryImportRow } from '../validators/inventoryImportRow.zod';

const program = new Command();

const firebaseConfig = {
    apiKey: "AIzaSyACvXyeSdEkpWXIPoV1sBXH8h84XNjBtSo",
    authDomain: "incaptta-pro.firebaseapp.com",
    projectId: "incaptta-pro",
    storageBucket: "incaptta-pro.firebasestorage.app",
    messagingSenderId: "408940478113",
    appId: "1:408940478113:web:8ea03252b84d1e29e7bae0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

program
    .option('--file <path>', 'Path to the Excel file', 'inventorydata.xlsx')
    .option('--sheet <name>', 'Name of the sheet to import', 'Extracting General Information ')
    .option('--dryRun <boolean>', 'Dry run mode (default: true)', 'true')
    .option('--strict <boolean>', 'Strict mode: abort if any validation fails (default: false)', 'false')
    .option('--onDuplicate <mode>', 'Duplicate handling (skip|update|upsert|error, default: skip)', 'skip')
    .option('--commitBatchSize <number>', 'Commit batch size (default: 400)', '400')
    .option('--logFile <path>', 'Path to save the import report (default: importReport.json)', 'importReport.json')
    .option('--createdBy <string>', 'User ID of the importer', 'import-script-client')
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

async function runImport() {
    const filePath = options.file;
    const dryRun = options.dryRun === 'true';
    const strict = options.strict === 'true';
    const onDuplicate = options.onDuplicate;
    const commitBatchSize = parseInt(options.commitBatchSize, 10);
    const createdBy = options.createdBy;

    const report: any = {
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
        console.log(`Step 1: Reading Excel file: ${filePath}`);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);

        const sheet = workbook.getWorksheet(options.sheet) || workbook.worksheets[0];
        if (!sheet) throw new Error(`Sheet "${options.sheet}" not found`);

        const headerRow = sheet.getRow(1);
        const headers: string[] = [];
        headerRow.eachCell((cell) => { headers.push(String(cell.value).trim()); });

        const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
        if (missing.length > 0) throw new Error(`Missing headers: ${missing.join(', ')}`);

        const headerIndices: Record<string, number> = {};
        headers.forEach((h, i) => { headerIndices[h] = i + 1; });

        console.log('Step 2: Validating Rows');
        const validatedRows: any[] = [];
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
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
                report.failures.push({ rowNumber, reason: result.error.issues.map(i => i.message).join(';') });
                if (strict) throw new Error(`Strict fail at row ${rowNumber}`);
                return;
            }
            report.validCount++;
            validatedRows.push({ ...result.data, rowNumber });
        });

        console.log('Step 3: Merging File-Duplicates');
        const skuMap: Map<string, any> = new Map();
        for (const row of validatedRows) {
            const sku = row.sku!;
            if (skuMap.has(sku)) {
                const existing = skuMap.get(sku)!;
                existing.inStock += row.inStock;
                existing.sourceRows.push(row.rowNumber);
                report.mergedCount++;
            } else {
                skuMap.set(sku, { ...row, sourceRows: [row.rowNumber] });
            }
        }
        report.rowsAfterMerge = skuMap.size;

        console.log('Step 4 & 5 & 6: Fetching and Updating Firestore');
        const inventoryCol = collection(db, 'inventoryItems');
        let batch = writeBatch(db);
        let batchCount = 0;

        for (const [sku, rowData] of skuMap.entries()) {
            const q = query(inventoryCol, where('sku', '==', sku));
            const snapshot = await getDocs(q);
            const existing = snapshot.docs[0];

            let action: 'create' | 'update' | 'skip' = existing ? 'update' : 'create';
            if (existing) {
                if (onDuplicate === 'skip') action = 'skip';
                else if (onDuplicate === 'error') throw new Error(`Duplicate SKU: ${sku}`);
            }

            if (action === 'skip') {
                report.skippedExistingCount++;
                continue;
            }

            const docRef = existing ? existing.ref : doc(inventoryCol);
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
                updatedAt: serverTimestamp(),
                createdBy,
                source: { fileName: report.fileName, sheetName: report.sheetName, rows: rowData.sourceRows }
            };

            if (action === 'create') {
                finalDoc.createdAt = serverTimestamp();
                if (!dryRun) batch.set(docRef, finalDoc);
                report.createdCount++;
            } else {
                if (!dryRun) batch.update(docRef, finalDoc);
                report.updatedCount++;
            }

            batchCount++;
            if (batchCount >= commitBatchSize) {
                if (!dryRun) await batch.commit();
                batch = writeBatch(db);
                batchCount = 0;
            }
        }

        if (batchCount > 0 && !dryRun) await batch.commit();
        console.log('Done.');
    } catch (error: any) {
        console.error('Error:', error.message);
        report.failures.push({ fatal: true, message: error.message });
    } finally {
        fs.writeFileSync(options.logFile, JSON.stringify(report, null, 2));
        console.table(report);
    }
}

runImport();
