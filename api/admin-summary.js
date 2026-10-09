const fs = require('fs');
const path = require('path');
const { parseCSV, getSafeNum } = require('../lib/csv');
const { getSessionEmail } = require('../lib/adminAuth');

const CURRENT_YEAR = 'FY2027';
const MONTH_PREFIXES = ['July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June'];

function readFile(filename) {
    const baseDir = path.join(process.cwd(), 'Data', CURRENT_YEAR, 'HR_Data');
    const filePath = path.join(baseDir, filename);
    if (!fs.existsSync(filePath)) return [];
    return parseCSV(fs.readFileSync(filePath, 'utf-8'));
}

function findByEmpCode(rows, code) {
    return rows.find(r => {
        let k = Object.keys(r).find(x => x === 'employeecode' || x === 'empcode' || x === 'code');
        return k && String(r[k]).trim() === code;
    }) || {};
}

function filterByEmpCode(rows, code) {
    return rows.filter(r => {
        let k = Object.keys(r).find(x => x === 'employeecode' || x === 'empcode' || x === 'code');
        return k && String(r[k]).trim() === code;
    });
}

// ---------------------------------------------------------------------------
// Tolerant date + month-column handling.
// CSVs get re-saved from Excel in different regional formats (17/10/2025,
// 17-10-2025, 17-Oct-2025, 2025-10-17 ...), so nothing here assumes a single
// format. Ambiguous numeric dates are read as dd/mm/yyyy, like the rest of the
// data. (The same logic lives in portal_app.js — keep the two in sync.)
// ---------------------------------------------------------------------------
const MONTH_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function monthFromName(s) { return MONTH_INDEX[String(s).slice(0, 3).toLowerCase()]; }
function expandYear(y) { y = parseInt(y, 10); return y < 100 ? 2000 + y : y; }
function makeValidDate(y, mi, d) {
    const dt = new Date(y, mi, d);
    return (dt.getFullYear() === y && dt.getMonth() === mi && dt.getDate() === d) ? dt : null;
}

function parseFlexibleDate(value) {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    const s = String(value == null ? '' : value).trim();
    if (!s) return null;
    let m;
    // yyyy-mm-dd
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/))) return makeValidDate(+m[1], +m[2] - 1, +m[3]);
    // dd-mm-yyyy, dd/mm/yyyy, dd.mm.yyyy (2- or 4-digit year)
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/))) {
        let day = +m[1], month = +m[2];
        if (month > 12 && day <= 12) { const t = day; day = month; month = t; } // clearly mm/dd
        return makeValidDate(expandYear(m[3]), month - 1, day);
    }
    // dd-Mon-yyyy, dd Month yyyy
    if ((m = s.match(/^(\d{1,2})[-\/.\s]+([A-Za-z]{3,9})[-\/.,\s']+(\d{2}|\d{4})$/)) && monthFromName(m[2]) !== undefined) {
        return makeValidDate(expandYear(m[3]), monthFromName(m[2]), +m[1]);
    }
    return null;
}

// Month a deduction column belongs to, from its header (first day of that month),
// or null if the header isn't a recognisable month/date.
function parseMonthHeader(header) {
    const s = String(header == null ? '' : header).replace(/\s+/g, ' ').trim();
    if (!s) return null;
    let m;
    // Excel serial date, e.g. 46204 = 01-Jul-2026
    if (/^\d{5}$/.test(s)) {
        const n = parseInt(s, 10);
        if (n < 30000 || n > 70000) return null;
        const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), 1);
    }
    // Jul-26, Jul-2026, Sept-26, July 2026, Jul'26
    if ((m = s.match(/^([A-Za-z]{3,9})[-\/.\s']*(\d{2}|\d{4})$/)) && monthFromName(m[1]) !== undefined) {
        return new Date(expandYear(m[2]), monthFromName(m[1]), 1);
    }
    // 2026-07, 2026/07
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})$/)) && +m[2] >= 1 && +m[2] <= 12) return new Date(+m[1], +m[2] - 1, 1);
    // 07-2026
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{4})$/)) && +m[1] >= 1 && +m[1] <= 12) return new Date(+m[2], +m[1] - 1, 1);
    // Numeric a/b/yyyy: month columns are always the 1st of a month, so whichever
    // part is "1" is the day (01/07/2026 -> July; 7/1/2026 -> July as well).
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/))) {
        const a = +m[1], b = +m[2], y = expandYear(m[3]);
        if (a === 1 && b >= 1 && b <= 12) return new Date(y, b - 1, 1);
        if (b === 1 && a >= 1 && a <= 12) return new Date(y, a - 1, 1);
    }
    // Any other full date (31/07/2026, 2026-07-01, 01-Jul-26): use its month
    const d = parseFlexibleDate(s);
    return d ? new Date(d.getFullYear(), d.getMonth(), 1) : null;
}

const ADVANCE_FIXED_FIELDS = new Set(['code', 'employee', 'tenure (months)', 'tenure(months)', 'grace period',
    'date of advance', 'advances', 'previously settled', 'settled outside of payroll']);

// (Returns the breakdown here; the portal copy returns just the total.)
// How much of an advance has been settled so far = prior settlements + the
// payroll deductions for every month that has FINISHED (this month's payroll
// hasn't run yet, so it isn't counted until the month is over — erring on the
// side of showing a slightly higher balance, never a lower one).
function getAdvanceSettledAmount(rawA, today) {
    today = today || new Date();
    const histSettled = getSafeNum(rawA['Previously settled']) + getSafeNum(rawA['Settled outside of payroll']);
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    let monthCols = [], otherCols = [];
    Object.keys(rawA).forEach(key => {
        const norm = key.replace(/\s+/g, ' ').trim().toLowerCase();
        if (ADVANCE_FIXED_FIELDS.has(norm)) return;
        const d = parseMonthHeader(key);
        if (d) monthCols.push({ key, date: d }); else otherCols.push(key);
    });

    // Safety net: no header looked like a month, but there are exactly 12 other
    // columns -> treat them as Jul..Jun of the current fiscal year, in file order.
    if (monthCols.length === 0 && otherCols.length === 12) {
        const fyYear = today.getMonth() < 6 ? today.getFullYear() - 1 : today.getFullYear();
        monthCols = otherCols.map((key, i) => ({ key, date: new Date(fyYear, 6 + i, 1) }));
        if (typeof console !== 'undefined') console.warn('Advances: month headers not recognised; assumed Jul-Jun in file order.', otherCols);
    } else if (monthCols.length === 0 && otherCols.length > 0 && typeof console !== 'undefined') {
        console.warn('Advances: could not identify month columns in headers:', otherCols);
    }

    let currentFYDeductions = 0;
    monthCols.forEach(c => { if (c.date < thisMonthStart) currentFYDeductions += getSafeNum(rawA[c.key]); });
    return { histSettled, currentFYDeductions, total: histSettled + currentFYDeductions };
}

function emptyBucket() {
    return {
        pf: { opening: 0, accrued: 0, total: 0 },
        gratuity: { opening: 0, accrued: 0, total: 0 },
        training: { opening: 0, accrued: 0, total: 0 },
        advances: { opening: 0, new: 0, settled: 0, total: 0 },
    };
}

function addBucket(target, add) {
    target.pf.opening += add.pf.opening; target.pf.accrued += add.pf.accrued; target.pf.total += add.pf.total;
    target.gratuity.opening += add.gratuity.opening; target.gratuity.accrued += add.gratuity.accrued; target.gratuity.total += add.gratuity.total;
    target.training.opening += add.training.opening; target.training.accrued += add.training.accrued; target.training.total += add.training.total;
    target.advances.opening += add.advances.opening; target.advances.new += add.advances.new; target.advances.settled += add.advances.settled; target.advances.total += add.advances.total;
}

module.exports = async (req, res) => {
    try {
        const email = getSessionEmail(req);
        if (!email) {
            return res.status(401).json({ error: 'Not signed in.' });
        }

        const staff = readFile('Staff_Master.csv');
        const pfData = readFile('PF.csv');
        const trainData = readFile('Training.csv');
        const advData = readFile('Advances.csv');

        const today = new Date();
        const currentFYYear = today.getMonth() < 6 ? today.getFullYear() - 1 : today.getFullYear();
        const fyStart = new Date(currentFYYear, 6, 1);
        const daysPassedInFY = Math.max(0, (today - fyStart) / (1000 * 60 * 60 * 24));

        const companyTotals = emptyBucket();
        const byDepartment = {};
        const lease = [];

        staff.forEach(emp => {
            const empCode = emp.employeecode || (emp._raw && emp._raw['Employee Code']) || '';
            if (!empCode) return;
            const empName = emp.employeename || (emp._raw && emp._raw['Employee Name']) || empCode;
            const department = (emp.department || (emp._raw && emp._raw['Department']) || '').trim() || 'Unassigned';
            const baseSalary = getSafeNum(emp.basesalary);

            // Tenure
            const joinDateObj = parseFlexibleDate(emp.joiningdate || (emp._raw && emp._raw['Joining Date']));
            let tenureMonths = 0;
            if (joinDateObj) {
                tenureMonths = (today.getFullYear() - joinDateObj.getFullYear()) * 12;
                tenureMonths -= joinDateObj.getMonth();
                tenureMonths += today.getMonth();
            }

            // --- PF ---
            const pfRow = findByEmpCode(pfData, empCode);
            const pfRaw = pfRow._raw || pfRow;
            const openingPF = getSafeNum(pfRaw['Opening PF']);
            const openingProfit = getSafeNum(pfRaw['Opening Profit']);
            let pfEmpCont = 0, pfEmployerCont = 0, pfProfit = openingProfit;
            MONTH_PREFIXES.forEach(month => {
                const mTotalCont = getSafeNum(pfRaw[`${month} Contribution`]);
                const mProfit = getSafeNum(pfRaw[`${month} Profit`]);
                pfEmpCont += mTotalCont / 2;
                pfEmployerCont += mTotalCont / 2;
                pfProfit += mProfit;
            });
            const currentWithdrawals = getSafeNum(pfRaw['Permanent withdrawals']);
            if (tenureMonths < 3) pfEmployerCont = 0;
            const pfOpening = openingPF + openingProfit;
            const pfTotal = (openingPF + pfEmpCont + pfEmployerCont + pfProfit) - currentWithdrawals;
            const pfAccrued = pfTotal - pfOpening;

            // --- GRATUITY ---
            // Base Salary / 2, applied to years served from 1-Jul-2023 (or
            // the employee's joining date if later). Gratuity.csv's opening
            // balance is no longer used at all.
            const gratAnchorDate = new Date(2023, 6, 1);
            const gratStartDate = (joinDateObj && joinDateObj > gratAnchorDate) ? joinDateObj : gratAnchorDate;
            const gratYearsServed = Math.max(0, (today - gratStartDate) / (1000 * 60 * 60 * 24 * 365.25));
            const gratTotalRaw = (baseSalary / 2) * gratYearsServed; // unconditional — Lease's formula uses this regardless of vesting, matching the existing per-employee logic
            const gratuityEligible = tenureMonths >= 36;
            const gratTotal = gratuityEligible ? gratTotalRaw : 0;
            const gratOpening = 0; // no longer applicable under the new formula
            const gratAccrued = gratTotal;

            // --- TRAINING ---
            const trainRow = findByEmpCode(trainData, empCode);
            const trainRaw = trainRow._raw || trainRow;
            const histAccrued = getSafeNum(trainRaw['Accrued']);
            const histExpense = getSafeNum(trainRaw['Expense']);
            const annualBudget = getSafeNum(emp.training || (emp._raw && emp._raw['Training']));
            const currentFYAccrual = (annualBudget / 365.25) * daysPassedInFY;
            const totalAccrued = histAccrued + currentFYAccrual;

            // --- ADVANCES (possibly several rows per employee) ---
            const empAdvances = filterByEmpCode(advData, empCode);
            let advOpening = 0, advNew = 0, advSettled = 0, existingAdvancesAmount = 0;
            empAdvances.forEach(advRow => {
                const raw = advRow._raw || advRow;
                const advAmount = getSafeNum(raw['Advances']);
                const { histSettled, currentFYDeductions, total: totalSettled } = getAdvanceSettledAmount(raw, today);
                const balance = Math.max(0, advAmount - totalSettled);
                existingAdvancesAmount += balance;

                const dateOfAdvance = parseFlexibleDate(raw['Date of advance']);
                const isNewThisFY = dateOfAdvance && dateOfAdvance >= fyStart;
                if (isNewThisFY) {
                    advNew += advAmount;
                } else {
                    advOpening += Math.max(0, advAmount - histSettled);
                }
                advSettled += currentFYDeductions;
            });
            const advTotal = Math.max(0, advOpening + advNew - advSettled);

            // --- LEASE (employee-wise, not summed) ---
            const leaseVal = String(emp.leaseeligibility || (emp._raw && emp._raw['Lease eligibility']) || '').trim().toLowerCase();
            const leaseIsEligible = leaseVal === 'yes' || leaseVal === 'y';
            const leaseAvailed = getSafeNum(emp.leaseamountavailed || (emp._raw && emp._raw['Lease amount availed']));
            const overageTraining = histExpense > totalAccrued ? (histExpense - totalAccrued) : 0;
            const leaseLimit = leaseIsEligible
                ? Math.max(0, (pfTotal + gratTotalRaw) - (existingAdvancesAmount + overageTraining + leaseAvailed))
                : 0;

            lease.push({
                employeeCode: empCode,
                employeeName: empName,
                department: department,
                eligible: leaseIsEligible,
                leaseLimit: Math.round(leaseLimit),
            });

            // --- Roll into totals ---
            const empBucket = {
                pf: { opening: pfOpening, accrued: pfAccrued, total: pfTotal },
                gratuity: { opening: gratOpening, accrued: gratAccrued, total: gratTotal },
                training: { opening: histAccrued, accrued: currentFYAccrual, total: totalAccrued },
                advances: { opening: advOpening, new: advNew, settled: advSettled, total: advTotal },
            };

            addBucket(companyTotals, empBucket);
            if (!byDepartment[department]) byDepartment[department] = emptyBucket();
            addBucket(byDepartment[department], empBucket);
        });

        lease.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

        return res.status(200).json({
            asOf: today.toISOString(),
            employeeCount: staff.length,
            totals: companyTotals,
            byDepartment: byDepartment,
            lease: lease,
        });

    } catch (err) {
        console.error('admin-summary error:', err);
        return res.status(500).json({ error: 'Failed to load summary.' });
    }
};
