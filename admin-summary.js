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

function parseDDMMYYYY(str) {
    if (!str) return null;
    let parts = String(str).split('/');
    if (parts.length !== 3) return null;
    let d = new Date(parts[2], parts[1] - 1, parts[0]);
    return isNaN(d.getTime()) ? null : d;
}

// Same "identify month columns by pattern, not position" fix already
// shipped for the per-employee Advances calculation — see portal_app.js.
function getAdvanceSettledAmount(rawA, today) {
    let histSettled = getSafeNum(rawA['Previously settled']) + getSafeNum(rawA['Settled outside of payroll']);
    let currentFYDeductions = 0;
    Object.keys(rawA).forEach(key => {
        let trimmedKey = key.trim();
        if (!/^\d{4,6}$/.test(trimmedKey)) return;
        let serial = parseInt(trimmedKey, 10);
        let monthDate = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
        if (monthDate <= today) currentFYDeductions += getSafeNum(rawA[key]);
    });
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
        const gratData = readFile('Gratuity.csv');
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
            const joinDateObj = parseDDMMYYYY(emp.joiningdate || (emp._raw && emp._raw['Joining Date']));
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
            const gratRow = findByEmpCode(gratData, empCode);
            const gratRaw = gratRow._raw || gratRow;
            const gratOpeningRaw = getSafeNum(gratRaw['Gratuity Payable']);
            const gratPeriodAccrual = (baseSalary * 0.0417) * 12 * (daysPassedInFY / 365.25);
            const gratTotalRaw = gratOpeningRaw + gratPeriodAccrual; // unconditional — Lease's formula uses this regardless of vesting, matching the existing per-employee logic
            const gratuityEligible = tenureMonths >= 36;
            const gratOpening = gratuityEligible ? gratOpeningRaw : 0;
            const gratAccrued = gratuityEligible ? gratPeriodAccrual : 0;
            const gratTotal = gratOpening + gratAccrued;

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

                const dateOfAdvance = parseDDMMYYYY(raw['Date of advance']);
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
