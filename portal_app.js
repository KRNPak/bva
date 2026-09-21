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
// 2. AUTHENTICATION (SECURE VERCEL API)
// ========================================================================
async function authenticateUser() {
    // 1. Safely grab the input value
    const cnicInputEl = document.getElementById('cnicInput');
    const cnicInput = cnicInputEl ? cnicInputEl.value.trim() : "";
    
    // 2. Safely grab the button and error message elements
    const btn = document.getElementById('loginBtn') || document.querySelector('button');
    const errorMsg = document.getElementById('errorMsg') || document.getElementById('errorMessage');

    // 3. Validation
    if (!cnicInput) {
        if (errorMsg) errorMsg.innerText = "Please enter your CNIC.";
        return;
    }

    // 4. Loading State
    if (btn) {
        btn.innerText = "Verifying...";
        btn.disabled = true;
    }
    if (errorMsg) errorMsg.innerText = "";

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
        emp = db.myProfile;

        // Switch screens
        const loginScreen = document.getElementById('loginScreen');
        const dashboardScreen = document.getElementById('dashboardScreen');
        if (loginScreen) loginScreen.style.display = 'none';
        if (dashboardScreen) dashboardScreen.style.display = 'block';
        
        renderDashboard();

    } catch (error) {
        if (errorMsg) {
            errorMsg.innerText = error.message || "Access Denied. Please check your CNIC.";
        } else {
            alert(error.message || "Access Denied. Please check your CNIC."); // Fallback if no error div exists
        }
        
        if (btn) {
            btn.innerText = "Secure Login \u2192";
            btn.disabled = false;
        }
    }
}

// ========================================================================
// 3. RENDER MAIN DASHBOARD
// ========================================================================
function renderDashboard() {
    if (!emp) return;

    // --- GLOBAL DATE & TENURE CALCULATION ---
    const baselineDate = new Date(); // Today's date
    const joinDateStr = emp.joiningdate || emp.doj; 
    const joinDate = joinDateStr ? new Date(joinDateStr) : new Date();
    
    // Calculate exact tenure in months
    let tenureMonths = (baselineDate.getFullYear() - joinDate.getFullYear()) * 12;
    tenureMonths -= joinDate.getMonth();
    tenureMonths += baselineDate.getMonth();

    // --- POPULATE HEADER PROFILE ---
    if(document.getElementById('empName')) document.getElementById('empName').innerText = emp.employee || "Employee";
    if(document.getElementById('empCode')) document.getElementById('empCode').innerText = emp.empcode || "";
    if(document.getElementById('empDesignation')) document.getElementById('empDesignation').innerText = emp.designation || "";

    // --- A. PROVIDENT FUND ---
    let pf = db.myPF || {};
    
    let openingPF = getSafeNum(pf.openingpf);
    let openingProfit = getSafeNum(pf.openingprofit);
    
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

    let pfWithdrawals = getSafeNum(pf.permanentwithdrawals);

    // Probation Lock Logic
    if (tenureMonths < 3) {
        pfEmployerCont = 0; 
        let empBox = document.getElementById('pfEmployerBox');
        if (empBox) {
            empBox.style.opacity = '0.3';
            empBox.title = "Employer match locked during probation.";
        }
    }
    
    let pfTotal = (pfEmpCont + pfEmployerCont + pfProfit) - pfWithdrawals;
    
    animateValue('pfTotal', pfTotal);
    if(document.getElementById('pfEmployee')) document.getElementById('pfEmployee').innerText = Math.round(pfEmpCont).toLocaleString('en-PK');
    if(document.getElementById('pfEmployer')) document.getElementById('pfEmployer').innerText = Math.round(pfEmployerCont).toLocaleString('en-PK');
    if(document.getElementById('pfProfit')) document.getElementById('pfProfit').innerText = Math.round(pfProfit).toLocaleString('en-PK');
    if(document.getElementById('pfWithdrawal')) document.getElementById('pfWithdrawal').innerText = Math.round(pfWithdrawals).toLocaleString('en-PK');

    // --- B. TRAINING BUDGET ---
    let trAccrued = getSafeNum(db.myTraining?.accrued);
    let trUtilized = getSafeNum(db.myTraining?.expense);
    let trAvailable = trAccrued - trUtilized;
    
    if(document.getElementById('trainLimit')) animateValue('trainLimit', trAvailable);
    if(document.getElementById('trainAccrued')) document.getElementById('trainAccrued').innerText = Math.round(trAccrued).toLocaleString('en-PK');
    if(document.getElementById('trainUtilized')) document.getElementById('trainUtilized').innerText = Math.round(trUtilized).toLocaleString('en-PK');

    // --- C. GRATUITY ---
    let gratOpening = getSafeNum(db.myGratuity?.opening); 
    let gratAccrual = getSafeNum(db.myGratuity?.gratuitypayable); 
    let gratTotal = gratOpening + gratAccrual; // Adjust if Gratuity Payable is already the grand total
    
    if(document.getElementById('gratTotal')) animateValue('gratTotal', gratTotal);
    if(document.getElementById('gratAccrued')) document.getElementById('gratAccrued').innerText = Math.round(gratAccrual).toLocaleString('en-PK');
    if(document.getElementById('gratOpening')) document.getElementById('gratOpening').innerText = Math.round(gratOpening).toLocaleString('en-PK');
    
    let years = Math.floor(Math.max(0, tenureMonths) / 12);
    let months = Math.max(0, tenureMonths) % 12;
    if(document.getElementById('gratTime')) document.getElementById('gratTime').innerText = `${years} Y, ${months} M`;

    // --- D. SALARY ADVANCES (Placeholder calculation) ---
    let baseSalary = getSafeNum(emp.basesalary || emp.salary);
    let advMax = Math.min(baseSalary * 5, pfTotal * 0.6);
    if(document.getElementById('advLimit')) animateValue('advLimit', advMax);
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
    
    let pf = db.myPF;
    if (!pf || Object.keys(pf).length === 0) return;

    let openingPF = getSafeNum(pf.openingpf);
    let openingProfit = getSafeNum(pf.openingprofit);
    let currentEmpTotal = openingPF / 2;
    let currentErTotal = openingPF / 2;
    let currentProfitTotal = openingProfit;

    const displayMonths = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const monthPrefixes = ['july', 'august', 'september', 'october', 'november', 'december', 'january', 'february', 'march', 'april', 'may', 'june'];
    
    let monthlyRows = '';
    
    for (let i = 0; i < 12; i++) {
        let mTotalCont = getSafeNum(pf[monthPrefixes[i] + 'contribution']);
        let mProfit = getSafeNum(pf[monthPrefixes[i] + 'profit']);
        
        let mEmp = mTotalCont / 2;
        let mEr = mTotalCont / 2;
        
        currentEmpTotal += mEmp;
        currentErTotal += mEr;
        currentProfitTotal += mProfit;

        if (mTotalCont > 0 || mProfit > 0) {
            monthlyRows += `
                <tr style="border-bottom: 1px solid var(--border-color); background: rgba(0,0,0,0.01);">
                    <td style="padding:6px 0; color:var(--text-secondary);">${displayMonths[i]}</td>
                    <td style="padding:6px 0; text-align:right;">${Math.round(mEmp).toLocaleString('en-PK')}</td>
                    <td style="padding:6px 0; text-align:right;">${Math.round(mEr).toLocaleString('en-PK')}</td>
                    <td style="padding:6px 0; text-align:right; color:var(--krn-green);">${Math.round(mProfit).toLocaleString('en-PK')}</td>
                </tr>
            `;
        }
    }

    let pfWithdrawals = getSafeNum(pf.permanentwithdrawals);
    let grandTotal = (currentEmpTotal + currentErTotal + currentProfitTotal) - pfWithdrawals;
    let preference = pf.pfpreference || 'Conventional';

    let monthlyTableHtml = monthlyRows ? `
        <div style="margin-top: 15px; margin-bottom: 15px; max-height: 160px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px;">
            <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
                <thead style="background: var(--bg-page); position: sticky; top: 0;">
                    <tr>
                        <th style="padding:8px 5px; text-align:left; color:var(--text-secondary);">Current Year</th>
                        <th style="padding:8px 5px; text-align:right; color:var(--text-secondary);">Emp Cont.</th>
                        <th style="padding:8px 5px; text-align:right; color:var(--text-secondary);">Er Cont.</th>
                        <th style="padding:8px 5px; text-align:right; color:var(--text-secondary);">Profit</th>
                    </tr>
                </thead>
                <tbody style="padding: 0 5px;">${monthlyRows}</tbody>
            </table>
        </div>
    ` : '';

    modal.innerHTML = `
        <div style="background:var(--bg-card); padding:25px; border-radius:12px; width:90%; max-width:550px; color:var(--text-primary); box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
                <h2 style="margin:0; color:var(--krn-blue);">Provident Fund Ledger</h2>
                <span style="font-size:0.75rem; background:var(--krn-blue); color:white; padding:3px 8px; border-radius:4px;">${preference}</span>
            </div>
            
            <table style="width:100%; border-collapse:collapse; font-size:0.85rem; margin-bottom:10px;">
                <tr style="border-bottom: 1px dashed var(--border-color);">
                    <td style="padding:8px 0; color:var(--text-secondary);">Opening PF (Net of past withdrawals)</td>
                    <td style="padding:8px 0; text-align:right;"><strong>${Math.round(openingPF).toLocaleString('en-PK')}</strong></td>
                </tr>
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding:8px 0; color:var(--text-secondary);">Opening Profits</td>
                    <td style="padding:8px 0; text-align:right;"><strong>${Math.round(openingProfit).toLocaleString('en-PK')}</strong></td>
                </tr>
            </table>

            ${monthlyTableHtml}
            
            <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                <tbody>
                    <tr>
                        <td style="padding:6px 0; color:var(--text-secondary);">Total Accumulated Emp Portion</td>
                        <td style="padding:6px 0; text-align:right; font-weight:bold;">${Math.round(currentEmpTotal).toLocaleString('en-PK')}</td>
                    </tr>
                    <tr>
                        <td style="padding:6px 0; color:var(--text-secondary);">Total Accumulated Er Portion</td>
                        <td style="padding:6px 0; text-align:right; font-weight:bold;">${Math.round(currentErTotal).toLocaleString('en-PK')}</td>
                    </tr>
                    <tr>
                        <td style="padding:6px 0; color:var(--text-secondary);">Total Accumulated Profits</td>
                        <td style="padding:6px 0; text-align:right; font-weight:bold; color:var(--krn-green);">${Math.round(currentProfitTotal).toLocaleString('en-PK')}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding:6px 0; color:var(--krn-orange);">Less: Current Year Withdrawals</td>
                        <td style="padding:6px 0; text-align:right; font-weight:bold; color:var(--krn-orange);">- ${Math.round(pfWithdrawals).toLocaleString('en-PK')}</td>
                    </tr>
                    <tr style="background:rgba(0,0,0,0.02);">
                        <td style="padding:15px 5px; font-weight:bold; color:var(--krn-blue);">Net Closing Balance</td>
                        <td style="padding:15px 5px; text-align:right; font-weight:bold; color:var(--krn-blue); font-size:1.1rem;">${Math.round(grandTotal).toLocaleString('en-PK')} PKR</td>
                    </tr>
                </tbody>
            </table>
            
            <div style="text-align:right; margin-top:20px;">
                <button onclick="document.getElementById('pfModal').style.display='none'" style="background:var(--krn-orange); color:white; border:none; padding:8px 20px; border-radius:6px; cursor:pointer; font-weight:bold;">Close</button>
            </div>
        </div>
    `;
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
