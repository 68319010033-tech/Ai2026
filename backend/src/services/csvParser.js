'use strict';

const { parse } = require('csv-parse/sync');

/**
 * Required columns for a valid schedule import CSV.
 * Rows missing any of these fields will be recorded as errors.
 */
const REQUIRED_FIELDS = ['subject', 'teacher', 'room', 'slots'];

/**
 * Parses a CSV buffer and validates each row against required fields.
 *
 * @param {Buffer} buffer - The raw file buffer from multer.
 * @param {string} [filename='upload.csv'] - Original filename for error reporting.
 * @returns {{ records: Array<Object>, errors: Array<{file, row, message}> }}
 */
function parseCSV(buffer, filename = 'upload.csv') {
  const records = [];
  const errors = [];

  let rawRows;
  try {
    rawRows = parse(buffer, {
      columns: true,          // Use first row as headers
      skip_empty_lines: true,
      trim: true,
      bom: true,              // Handle BOM character if present
    });
  } catch (parseErr) {
    errors.push({
      file: filename,
      row: null,
      message: `Failed to parse CSV: ${parseErr.message}`,
    });
    return { records, errors };
  }

  if (rawRows.length === 0) {
    errors.push({ file: filename, row: null, message: 'CSV file is empty or has no data rows.' });
    return { records, errors };
  }

  // Validate headers — check that all required fields exist
  const headers = Object.keys(rawRows[0]).map((h) => h.toLowerCase());
  const missingHeaders = REQUIRED_FIELDS.filter((f) => !headers.includes(f));
  if (missingHeaders.length > 0) {
    errors.push({
      file: filename,
      row: null,
      message: `Missing required columns: ${missingHeaders.join(', ')}. Found: ${headers.join(', ')}`,
    });
    return { records, errors };
  }

  // Validate each row
  rawRows.forEach((row, index) => {
    const rowNumber = index + 2; // +2 because row 1 is the header
    const normalizedRow = {};

    // Normalize keys to lowercase
    for (const [key, value] of Object.entries(row)) {
      normalizedRow[key.toLowerCase()] = value;
    }

    const rowErrors = [];
    for (const field of REQUIRED_FIELDS) {
      const value = normalizedRow[field];
      if (value === undefined || value === null || String(value).trim() === '') {
        rowErrors.push(`"${field}" is empty or missing`);
      }
    }

    if (rowErrors.length > 0) {
      errors.push({
        file: filename,
        row: rowNumber,
        message: rowErrors.join('; '),
      });
    } else {
      records.push(normalizedRow);
    }
  });

  return { records, errors };
}

module.exports = { parseCSV, REQUIRED_FIELDS };
