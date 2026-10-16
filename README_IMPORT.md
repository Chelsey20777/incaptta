# Inventory Importer

Reliable pipeline to import inventory from Excel to Firestore.

## Usage

1.  **Build the project**:
    ```bash
    npm run build
    ```
2.  **Run the script**:
    ```bash
    node dist/scripts/importInventory.js --file "./path/to/Excel.xlsx" [options]
    ```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--file` | Path to the Excel file (Required) | - |
| `--sheet` | Sheet name to process | First sheet |
| `--dryRun` | If true, simulates without writing to Firestore | `true` |
| `--strict` | If true, aborts on first validation error | `false` |
| `--onDuplicate` | `skip`, `update`, `upsert`, or `error` | `skip` |
| `--commitBatchSize` | Number of docs per transaction | `400` |
| `--logFile` | Output path for the JSON report | `importReport.json` |

## Mapping

The script expects exactly 9 columns:
-   `Category`
-   `Name`
-   `SKU`
-   `In Stock`
-   `Purchase price`
-   `Freight & Duty`
-   `Total Cost`
-   `Markup %`
-   `IRD ((Selling Price)`

## Features

-   **SKU Normalization**: Trims, uppercases, and removes special characters.
-   **In-File Merging**: Combines rows with duplicate SKUs (sums stock, takes last non-null for other fields).
-   **Derived Logic**:
    -   `Total Cost` = `Purchase price` + `Freight & Duty` (if blank).
    -   `Selling Price` = `Total Cost` * (1 + `Markup` / 100) (if blank).
-   **Atomic Batches**: Efficiently writes to Firestore using Batched Writes.
