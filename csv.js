// Same parser as api/get-employee-data.js. Kept as a separate copy there
// (rather than refactored to import this) so this file's addition carries
// zero risk to that already-hardened, already-tested endpoint.

function parseCSV(text) {
    let objects = [];
    let inQuotes = false;
    let currentRow = [];
    let currentCell = '';

    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        let nextChar = text[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentCell += '"'; i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentCell.trim());
            currentCell = '';
        } else if (char === '\n' && !inQuotes) {
            currentRow.push(currentCell.trim());
            if (currentRow.join('').trim() !== '') objects.push(currentRow);
            currentRow = [];
            currentCell = '';
        } else {
            currentCell += char;
        }
    }
    currentRow.push(currentCell.trim());
    if (currentRow.join('').trim() !== '') objects.push(currentRow);

    if (objects.length < 2) return [];

    const rawHeaders = objects[0];
    const headers = rawHeaders.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

    const parsedData = [];
    for (let i = 1; i < objects.length; i++) {
        const row = objects[i];
        const obj = { _raw: {} };
        for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = row[j] || '';
            obj._raw[rawHeaders[j]] = row[j] || '';
        }
        parsedData.push(obj);
    }
    return parsedData;
}

function getSafeNum(val) {
    if (typeof val === 'string') val = val.replace(/,/g, '');
    let num = parseFloat(val);
    return isNaN(num) ? 0 : num;
}

module.exports = { parseCSV, getSafeNum };
