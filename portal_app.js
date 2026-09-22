// ========================================================================
// 3. RENDER MAIN DASHBOARD
// ========================================================================
function renderDashboard() {
    if (!emp) return;

    // --- 1. AGGRESSIVE DATA EXTRACTION (Fixes the zeros & missing profile) ---
    // We look inside the "_raw" object that Vercel created for your CSVs
    let rawEmp = db.emp?._raw || db.emp || {};
    let rawGrat = db.myGratuity?._raw || db.myGratuity || {};
    let rawPF = db.myPF?._raw || db.myPF || {};
    let rawTrain = db.myTraining?._raw || db.myTraining || {};

    // Profile Data Extraction
    let employeeName = rawGrat['Employee Name'] || rawPF['Employee'] || rawEmp['Employee Name'] || "Employee Name";
    let designation = rawEmp['Position code'] || rawEmp['Designation'] || "";
    let gradeStr = rawEmp['Grade'] || "0";
    let gradeNum = parseInt(gradeStr.toString().replace(/\D/g, '')) || 0;
    let baseSalary = getSafeNum(rawEmp['Base Salary'] || rawEmp['Salary']);
    let joinDateStr = rawEmp['Joining Date'] || rawEmp['DOJ'] || rawEmp.joiningdate;

    // --- 2. HEADER DOM UPDATES ---
    if(document.getElementById('empName')) document.getElementById('empName').innerText = employeeName;
    if(document.getElementById('empCode')) document.getElementById('empCode').innerText = rawEmp['Employee Code'] || rawEmp['Emp Code'] || "";
    if(document.getElementById('empDesignation')) {
        document.getElementById('empDesignation').innerText = `${designation} | Grade: ${gradeNum} | Joined: ${joinDateStr || 'N/A'}`;
    }

    // --- 3. DATES & TENURE ---
    const baselineDate = new Date(); 
    const joinDate = joinDateStr ? new Date(joinDateStr) : new Date();
    let tenureMonths = (baselineDate.getFullYear() - joinDate.getFullYear()) * 12;
    tenureMonths -= joinDate.getMonth();
    tenureMonths += baselineDate.getMonth();

    // --- A. PROVIDENT FUND ---
    let pf = db.myPF || {};
    let openingPF = getSafeNum(pf.openingpf || rawPF['Opening PF']);
    let openingProfit = getSafeNum(pf.openingprofit || rawPF['Opening Profit']);
    
    let pfEmpCont = openingPF / 2;
    let pfEmployerCont = openingPF / 2;
    let pfProfit = openingProfit;

    const monthPrefixes = ['july', 'august', 'september', 'october', 'november', 'december', 'january', 'february', 'march', 'april', 'may', 'june'];
    for (let month of monthPrefixes) {
        let mTotalCont = getSafeNum(pf[month + 'contribution']);
        let mProfit = getSafeNum(pf[month + 'profit']);
        pfEmpCont += (mTotalCont / 2);
        pfEmployerCont += (mTotalCont / 2);
        pfProfit += mProfit;
    }

    let pfWithdrawals = getSafeNum(pf.permanentwithdrawals || rawPF['Permanent Withdrawals']);
    if (tenureMonths < 3) pfEmployerCont = 0; // Probation lock
    
    let pfTotal = (pfEmpCont + pfEmployerCont + pfProfit) - pfWithdrawals;
    
    if(document.getElementById('pfTotal')) animateValue('pfTotal', pfTotal);
    if(document.getElementById('pfEmployee')) document.getElementById('pfEmployee').innerText = Math.round(pfEmpCont).toLocaleString('en-PK');
    if(document.getElementById('pfEmployer')) document.getElementById('pfEmployer').innerText = Math.round(pfEmployerCont).toLocaleString('en-PK');
    if(document.getElementById('pfProfit')) document.getElementById('pfProfit').innerText = Math.round(pfProfit).toLocaleString('en-PK');
    if(document.getElementById('pfWithdrawal')) document.getElementById('pfWithdrawal').innerText = Math.round(pfWithdrawals).toLocaleString('en-PK');

    // --- B. TRAINING BUDGET ---
    let trAccrued = getSafeNum(rawTrain['Accrued'] || rawTrain.accrued);
    let trUtilized = getSafeNum(rawTrain['Expense'] || rawTrain.expense);
    let trAvailable = Math.max(0, trAccrued - trUtilized);
    
    if(document.getElementById('trainLimit')) animateValue('trainLimit', trAvailable);
    if(document.getElementById('trainAccrued')) document.getElementById('trainAccrued').innerText = Math.round(trAccrued).toLocaleString('en-PK');
    if(document.getElementById('trainUtilized')) document.getElementById('trainUtilized').innerText = Math.round(trUtilized).toLocaleString('en-PK');

    // --- C. GRATUITY ---
    let gratAccrual = getSafeNum(rawGrat['Gratuity Payable'] || rawGrat.gratuitypayable);
    let gratOpening = getSafeNum(rawGrat['Opening'] || rawGrat.opening || 0);
    let gratTotal = gratOpening + gratAccrual;
    
    if(document.getElementById('gratTotal')) animateValue('gratTotal', gratTotal);
    if(document.getElementById('gratAccrued')) document.getElementById('gratAccrued').innerText = Math.round(gratAccrual).toLocaleString('en-PK');
    if(document.getElementById('gratOpening')) document.getElementById('gratOpening').innerText = Math.round(gratOpening).toLocaleString('en-PK');

    // --- D. SALARY ADVANCES ---
    let existingAdvancesAmount = 0;
    let existingAdvancesCount = 0;
    
    if (Array.isArray(db.myAdvances)) {
        existingAdvancesCount = db.myAdvances.length;
        existingAdvancesAmount = db.myAdvances.reduce((sum, adv) => sum + getSafeNum(adv?.amount || adv?.balance || adv?._raw?.['Amount']), 0);
    }

    let advMax = 0;
    if (existingAdvancesCount < 3 && baseSalary > 0) {
        let condition1 = baseSalary * 5;
        let condition2 = (pfTotal * 0.6) - existingAdvancesAmount;
        advMax = Math.max(0, Math.min(condition1, condition2));
    }
    if(document.getElementById('advLimit')) animateValue('advLimit', advMax);

    // --- E. LEASE FINANCE LIMIT ---
    let leaseLimitEl = document.getElementById('leaseLimit');
    if (leaseLimitEl) {
        if (gradeNum < 9) {
            leaseLimitEl.innerText = "Not Eligible";
            leaseLimitEl.style.fontSize = "1.5rem"; 
        } else {
            let overageTraining = trUtilized > trAccrued ? (trUtilized - trAccrued) : 0;
            let leaseLimit = (pfTotal + gratTotal) - (existingAdvancesAmount + overageTraining);
            leaseLimit = Math.max(0, leaseLimit);
            
            leaseLimitEl.style.fontSize = ""; // Reset font in case it was modified
            animateValue('leaseLimit', leaseLimit);
        }
    }
}
