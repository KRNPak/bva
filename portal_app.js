// ========================================================================
// 1. GLOBAL VARIABLES & HELPERS
// ========================================================================
let db = {};
let emp = null;

function getSafeNum(val) {
    let num = parseFloat(val);
    return isNaN(num) ? 0 : num;
}

function animateValue(id, end, duration = 1000) {
    let obj = document.getElementById(id);
    if (!obj) return;
    let start = 0;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * end).toLocaleString('en-PK');
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// ========================================================================
// 2. AUTHENTICATION
// ========================================================================
async function authenticateUser() {
    const cnicInputEl = document.getElementById('cnicInput');
    const cnicInput = cnicInputEl ? cnicInputEl.value.trim() : "";
    
    const btn = document.querySelector('.login-btn') || document.querySelector('button');
    const errorMsg = document.getElementById('loginError') || document.getElementById('errorMsg');

    if (!cnicInput) {
        if (errorMsg) {
            errorMsg.innerText = "Please enter your CNIC.";
            errorMsg.style.display = "block";
        }
        return;
    }

    if (btn) {
        btn.innerText = "Verifying...";
        btn.disabled = true;
    }
    if (errorMsg) errorMsg.style.display = "none";

    try {
        const response = await fetch('/api/get-employee-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cnic: cnicInput })
        });

        if (!response.ok) {
            throw new Error("Invalid CNIC or Data Not Found");
        }

        db = await response.json();
        emp = db.emp; // Mapped to the correct backend object

        const loginScreen = document.getElementById('loginScreen');
        const dashboardScreen = document.getElementById('dashboardScreen');
        if (loginScreen) loginScreen.style.display = 'none';
        if (dashboardScreen) dashboardScreen.style.display = 'block';
        
        renderDashboard();

    } catch (error) {
        if (errorMsg) {
            errorMsg.innerText = error.message || "Access Denied. Please check your CNIC.";
            errorMsg.style.display = "block";
        }
        if (btn) {
            btn.innerText = "Secure Login \u2192";
            btn.disabled = false;
        }
    }
}

function logout() {
    db = {};
    emp = null;
    document.getElementById('cnicInput').value = "";
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('dashboardScreen').style.display = 'none';
    
    let btn = document.querySelector('.login-btn');
    if (btn) {
        btn.innerText = "Secure Login \u2192";
        btn.disabled = false;
    }
}

// ========================================================================
// 3. RENDER MAIN DASHBOARD
// ========================================================================
function renderDashboard() {
    if (!emp) return;

    // --- 1. AGGRESSIVE DATA EXTRACTION ---
    let rawEmp = db.emp?._raw || db.emp || {};
    let rawGrat = db.myGratuity?._raw || db.myGratuity || {};
    let rawPF = db.myPF?._raw || db.myPF || {};
    let rawTrain = db.myTraining?._raw || db.myTraining || {};

    let employeeName = rawGrat['Employee Name'] || rawPF['Employee'] || rawEmp['Employee Name'] || "Employee Name";
    let designation = rawEmp['Position code'] || rawEmp['Designation'] || "";
    let gradeStr = rawEmp['Grade'] || rawEmp['grade'] || "0";
    let gradeNum = parseInt(gradeStr.toString().replace(/\D/g, '')) || 0;
    let baseSalary = getSafeNum(rawEmp['Base Salary'] || rawEmp['Salary'] || rawEmp['basesalary']);
    let joinDateStr = rawEmp['Joining Date'] || rawEmp['DOJ'] || rawEmp.joiningdate;

    // --- 2. HEADER DOM UPDATES ---
    if(document.getElementById('empNameDisplay')) document.getElementById('empNameDisplay').innerText = employeeName;
    if(document.getElementById('empDesignationDisplay')) document.getElementById('empDesignationDisplay').innerText = designation;
    if(document.getElementById('empGradeDisplay')) document.getElementById('empGradeDisplay').innerText = gradeNum;
    if(document.getElementById('empJoinDisplay')) document.getElementById('empJoinDisplay').innerText = joinDateStr || 'N/A';

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
    if (tenureMonths < 3) pfEmployerCont = 0; 
    
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
    
    if(document.getElementById('trainAvailable')) animateValue('trainAvailable', trAvailable);
    if(document.getElementById('trainAccrued')) document.getElementById('trainAccrued').innerText = Math.round(trAccrued).toLocaleString('en-PK');
    if(document.getElementById('trainUtilized')) document.getElementById('trainUtilized').innerText = Math.round(trUtilized).toLocaleString('en-PK');

    // --- C. GRATUITY ---
    let gratAccrual = getSafeNum(rawGrat['Gratuity Payable'] || rawGrat.gratuitypayable);
    let gratOpening = getSafeNum(rawGrat['Opening'] || rawGrat.opening || 0);
    let gratTotal = gratOpening + gratAccrual;
    
    if(document.getElementById('gratuityTotal')) animateValue('gratuityTotal', gratTotal);
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
            
            leaseLimitEl.style.fontSize = ""; 
            animateValue('leaseLimit', leaseLimit);
        }
    }
}

// ========================================================================
// 4. MODALS (PF LEDGER)
// ========================================================================
function openPFModal() {
    let modal = document.getElementById('pfModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pfModal';
        modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; backdrop-filter: blur(4px);";
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
}

// ========================================================================
// 5. THEME MANAGEMENT
// ========================================================================
function toggleTheme() {
    const body = document.body;
    const label = document.getElementById('themeLabel');
    const checkbox = document.getElementById('themeToggleCheckbox');
    
    if (body.classList.contains('light-mode')) {
        body.classList.replace('light-mode', 'dark-mode');
        localStorage.setItem('krnTheme', 'dark-mode');
        if(label) label.innerText = 'DARK';
        if(checkbox) checkbox.checked = true;
    } else {
        body.classList.replace('dark-mode', 'light-mode');
        localStorage.setItem('krnTheme', 'light-mode');
        if(label) label.innerText = 'LIGHT';
        if(checkbox) checkbox.checked = false;
    }
}

(function initializeTheme() {
    const savedTheme = localStorage.getItem('krnTheme') || 'light-mode';
    document.body.className = savedTheme;
    
    setTimeout(() => {
        const label = document.getElementById('themeLabel');
        const checkbox = document.getElementById('themeToggleCheckbox');
        if (savedTheme === 'dark-mode') {
            if(label) label.innerText = 'DARK';
            if(checkbox) checkbox.checked = true;
        } else {
            if(label) label.innerText = 'LIGHT';
            if(checkbox) checkbox.checked = false;
        }
    }, 100);
})();
