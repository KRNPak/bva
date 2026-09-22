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
        emp = db.emp; 

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

    // --- 1. AGGRESSIVE & DYNAMIC DATA EXTRACTION ---
    let rawEmp = db.emp?._raw || db.emp || {};
    let rawGrat = db.myGratuity?._raw || db.myGratuity || {};
    let rawPF = db.myPF?._raw || db.myPF || {};
    let rawTrain = db.myTraining?._raw || db.myTraining || {};

    let employeeName = rawGrat['Employee Name'] || rawPF['Employee'] || rawEmp['Employee Name'] || "Employee Name";
    
    // Dynamically hunt for Employee Code
    let empCodeKey = Object.keys(rawEmp).find(k => k.toLowerCase().replace(/\s/g, '') === 'employeecode' || k.toLowerCase() === 'emp code');
    let designation = (empCodeKey ? rawEmp[empCodeKey] : null) || rawEmp['Employee Code'] || rawEmp['Position code'] || "";

    // Dynamically hunt for Grade
    let gradeKey = Object.keys(rawEmp).find(k => k.toLowerCase().includes('grade'));
    let gradeStr = gradeKey ? rawEmp[gradeKey] : "0";
    let gradeNum = parseInt(gradeStr.toString().replace(/\D/g, '')) || 0;

    let salaryKey = Object.keys(rawEmp).find(k => k.toLowerCase().includes('salary'));
    let baseSalary = getSafeNum(salaryKey ? rawEmp[salaryKey] : 0) || getSafeNum(rawPF['Base Salary']);

    // Date formatting to DD-MMM-YYYY
    let joinDateKey = Object.keys(rawEmp).find(k => k.toLowerCase().includes('join') || k.toLowerCase() === 'doj');
    let joinDateStr = joinDateKey ? rawEmp[joinDateKey] : null;
    let formattedJoinDate = "N/A";
    let joinDateObj = new Date();
    
    if (joinDateStr) {
        let d = new Date(joinDateStr);
        if (!isNaN(d)) {
            joinDateObj = d;
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            formattedJoinDate = `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
        } else {
            formattedJoinDate = joinDateStr; 
        }
    }

    // --- 2. HEADER DOM UPDATES ---
    if(document.getElementById('empNameDisplay')) document.getElementById('empNameDisplay').innerText = employeeName;
    if(document.getElementById('empDesignationDisplay')) document.getElementById('empDesignationDisplay').innerText = designation;
    if(document.getElementById('empGradeDisplay')) document.getElementById('empGradeDisplay').innerText = gradeNum;
    if(document.getElementById('empJoinDisplay')) document.getElementById('empJoinDisplay').innerText = formattedJoinDate;

    // --- 3. DATES & TENURE ---
    const baselineDateTenure = new Date(); 
    let tenureMonths = (baselineDateTenure.getFullYear() - joinDateObj.getFullYear()) * 12;
    tenureMonths -= joinDateObj.getMonth();
    tenureMonths += baselineDateTenure.getMonth();

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
    let gratOpening = getSafeNum(rawGrat['Gratuity Payable'] || rawGrat.gratuitypayable || rawGrat['Opening'] || 0);
    
    let today = new Date();
    let baselineDate = new Date(today.getFullYear() - (today.getMonth() < 6 ? 1 : 0), 6, 1); 
    let gratPeriodAccrual = today > baselineDate ? (baseSalary * 0.5) * ((today - baselineDate) / (1000 * 60 * 60 * 24 * 365.25)) : 0;
    
    let gratTotal = gratOpening + gratPeriodAccrual;
    
    if(document.getElementById('gratuityTotal')) animateValue('gratuityTotal', gratTotal);
    
    let gratBreakdownEl = document.getElementById('gratuityBreakdown');
    if(gratBreakdownEl) {
        gratBreakdownEl.innerHTML = `
            <span style="color: var(--text-secondary);">Opening:</span> <strong>${Math.round(gratOpening).toLocaleString('en-PK')}</strong><br>
            <span style="color: var(--text-secondary);">Accrued:</span> <strong>${Math.round(gratPeriodAccrual).toLocaleString('en-PK')}</strong>
        `;
    }

    // --- D. SALARY ADVANCES ---
   // --- D. SALARY ADVANCES ---
    let existingAdvancesAmount = 0;
    let existingAdvancesCount = 0;
    
    let validAdvances = [];
    if (Array.isArray(db.myAdvances)) {
        validAdvances = db.myAdvances.filter(adv => adv && Object.keys(adv).length > 0 && getSafeNum(adv?.amount || adv?.balance || adv?._raw?.['Advances'] || adv?._raw?.['Amount']) > 0);
    } else if (db.myAdvances && typeof db.myAdvances === 'object') {
        if (getSafeNum(db.myAdvances.amount || db.myAdvances.balance || db.myAdvances._raw?.['Advances'] || db.myAdvances._raw?.['Amount']) > 0) {
            validAdvances = [db.myAdvances];
        }
    }

    existingAdvancesCount = validAdvances.length;
    existingAdvancesAmount = validAdvances.reduce((sum, adv) => sum + getSafeNum(adv?.amount || adv?.balance || adv?._raw?.['Advances'] || adv?._raw?.['Amount']), 0);

    let advMax = 0; 
    if (existingAdvancesCount < 3) {
        let condition1 = baseSalary > 0 ? (baseSalary * 5) : (pfTotal * 0.6); 
        let condition2 = (pfTotal * 0.6) - existingAdvancesAmount;
        advMax = Math.max(0, Math.min(condition1, condition2));
    }
    
    if(document.getElementById('advLimit')) animateValue('advLimit', advMax);

    // INJECT THE PROGRESS BARS
    let advancesContainer = document.getElementById('activeAdvancesContainer');
    if (advancesContainer) {
        advancesContainer.innerHTML = ''; 
        if (validAdvances.length > 0) {
            let advancesHTML = '<div style="margin-top: 15px;">';
            
            validAdvances.forEach((adv, index) => {
                let rawA = adv._raw || adv;
                let advAmount = getSafeNum(adv.amount || rawA['Advances'] || rawA['Amount']);
                let settled = getSafeNum(rawA[' Previously settled ']) + getSafeNum(rawA[' Settled outside of payroll ']);
                let balance = advAmount - settled;
                let percent = advAmount > 0 ? (settled / advAmount) * 100 : 0;
                
                advancesHTML += `
                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 4px;">
                            <span style="color: var(--text-secondary);">Advance ${index + 1} Balance</span>
                            <strong style="color: var(--krn-orange);">${Math.round(balance).toLocaleString('en-PK')} PKR</strong>
                        </div>
                        <div style="width: 100%; background: rgba(0,0,0,0.1); border-radius: 4px; height: 6px; overflow: hidden;">
                            <div style="width: ${percent}%; background: var(--krn-blue); height: 100%; border-radius: 4px;"></div>
                        </div>
                    </div>
                `;
            });
            advancesHTML += '</div>';
            advancesContainer.innerHTML = advancesHTML;
        } else {
            advancesContainer.innerHTML = '<div style="margin-top: 15px; font-size: 0.8rem; color: var(--text-secondary);">No active advances.</div>';
        }
    }
    
    // --- E. LEASE FINANCE LIMIT ---
    let leaseLimitEl = document.getElementById('leaseLimit');
    let leaseCard = document.getElementById('leaseCard');
    
    if (gradeNum < 9) {
        if (leaseLimitEl) leaseLimitEl.innerText = "0";
        if (leaseCard) {
            leaseCard.classList.add('locked-card');
            if (!leaseCard.querySelector('.locked-overlay')) {
                leaseCard.insertAdjacentHTML('beforeend', `<div class="locked-overlay"><span style="font-size:1.2rem; font-weight:bold; color:var(--text-primary);">Grade 9+ Only</span></div>`);
            }
        }
    } else {
        let overageTraining = trUtilized > trAccrued ? (trUtilized - trAccrued) : 0;
        let leaseLimit = (pfTotal + gratTotal) - (existingAdvancesAmount + overageTraining);
        leaseLimit = Math.max(0, leaseLimit);
        
        if (leaseLimitEl) {
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
    
    let pf = db.myPF || {};
    let rawPF = db.myPF?._raw || db.myPF || {};
    if (Object.keys(rawPF).length === 0 && Object.keys(pf).length === 0) return;

    let openingPF = getSafeNum(pf.openingpf || rawPF['Opening PF']);
    let openingProfit = getSafeNum(pf.openingprofit || rawPF['Opening Profit']);
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

    let pfWithdrawals = getSafeNum(pf.permanentwithdrawals || rawPF['Permanent Withdrawals']);
    let grandTotal = (currentEmpTotal + currentErTotal + currentProfitTotal) - pfWithdrawals;

    modal.innerHTML = `
        <div style="background:var(--bg-card); padding:25px; border-radius:12px; width:90%; max-width:550px; color:var(--text-primary); box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
                <h2 style="margin:0; color:var(--krn-blue);">Provident Fund Ledger</h2>
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:0.85rem; margin-bottom:10px;">
                <tr style="border-bottom: 1px dashed var(--border-color);">
                    <td style="padding:8px 0; color:var(--text-secondary);">Opening PF</td>
                    <td style="padding:8px 0; text-align:right;"><strong>${Math.round(openingPF).toLocaleString('en-PK')}</strong></td>
                </tr>
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding:8px 0; color:var(--text-secondary);">Opening Profits</td>
                    <td style="padding:8px 0; text-align:right;"><strong>${Math.round(openingProfit).toLocaleString('en-PK')}</strong></td>
                </tr>
            </table>
            
            ${monthlyRows ? `
            <div style="margin-top: 15px; margin-bottom: 15px; max-height: 160px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px;">
                <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
                    <thead style="background: var(--bg-page); position: sticky; top: 0;">
                        <tr>
                            <th style="padding:8px 5px; text-align:left; color:var(--text-secondary);">Month</th>
                            <th style="padding:8px 5px; text-align:right; color:var(--text-secondary);">Emp Cont.</th>
                            <th style="padding:8px 5px; text-align:right; color:var(--text-secondary);">Er Cont.</th>
                            <th style="padding:8px 5px; text-align:right; color:var(--text-secondary);">Profit</th>
                        </tr>
                    </thead>
                    <tbody style="padding: 0 5px;">${monthlyRows}</tbody>
                </table>
            </div>` : ''}
            
            <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                <tbody>
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding:6px 0; color:var(--krn-orange);">Less: Withdrawals</td>
                        <td style="padding:6px 0; text-align:right; font-weight:bold; color:var(--krn-orange);">- ${Math.round(pfWithdrawals).toLocaleString('en-PK')}</td>
                    </tr>
                    <tr style="background:rgba(0,0,0,0.02);">
                        <td style="padding:15px 5px; font-weight:bold; color:var(--krn-blue);">Net Closing Balance</td>
                        <td style="padding:15px 5px; text-align:right; font-weight:bold; color:var(--krn-blue); font-size:1.1rem;">${Math.round(grandTotal).toLocaleString('en-PK')} PKR</td>
                    </tr>
                </tbody>
            </table>
            <div style="text-align:right; margin-top:20px;">
                <button onclick="document.getElementById('pfModal').style.display='none'" style="background:var(--krn-blue); color:white; border:none; padding:8px 20px; border-radius:6px; cursor:pointer; font-weight:bold;">Close</button>
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
// ========================================================================
// 6. TAX CERTIFICATE GENERATION
// ========================================================================
function generateTaxPDF() {
    if (!emp) return;
    const template = document.getElementById('pdfTemplate');
    if (!template) {
        alert("PDF Template not found in HTML.");
        return;
    }
    
    let yearSelect = document.getElementById('taxYearSelect');
    let yearText = yearSelect ? yearSelect.options[yearSelect.selectedIndex].text : "Tax Year";
    let empName = document.getElementById('empNameDisplay')?.innerText || 'Employee';
    let cnic = document.getElementById('cnicInput')?.value || 'N/A';
    
    template.innerHTML = `
        <div style="padding: 40px; font-family: Arial, sans-serif; color: #333; background: white;">
            <div style="text-align: center; border-bottom: 2px solid #005A9C; margin-bottom: 30px; padding-bottom: 20px;">
                <h2 style="color: #005A9C; margin: 0;">KARANDAAZ PAKISTAN</h2>
                <h3 style="margin: 10px 0 5px 0;">Section 149 Tax Deduction Certificate</h3>
                <p style="margin: 0; font-size: 1.1rem; color: #666;">${yearText}</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 1.1rem;">
                <tr>
                    <td style="padding: 12px; border: 1px solid #ddd; background: #f9f9f9; width: 40%; font-weight: bold;">Employee Name</td>
                    <td style="padding: 12px; border: 1px solid #ddd;">${empName}</td>
                </tr>
                <tr>
                    <td style="padding: 12px; border: 1px solid #ddd; background: #f9f9f9; font-weight: bold;">CNIC</td>
                    <td style="padding: 12px; border: 1px solid #ddd;">${cnic}</td>
                </tr>
            </table>
            <p style="font-size: 1rem; line-height: 1.6;">
                This is to certify that Karandaaz Pakistan has deducted tax under Section 149 of the Income Tax Ordinance, 2001, 
                from the salary of the above-mentioned employee for the period <strong>${yearText}</strong>.
            </p>
        </div>
    `;
    
    template.style.display = 'block';
    
    html2pdf().from(template).set({
        margin: 0, filename: `Tax_Certificate_${cnic}.pdf`,
        image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    }).save().then(() => {
        template.style.display = 'none';
    });
}

// ========================================================================
// 7. ADVANCES MODAL & CLICK LISTENER
// ========================================================================
function openAdvancesModal() {
    let modal = document.getElementById('advModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'advModal';
        modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; backdrop-filter: blur(4px);";
        document.body.appendChild(modal);
    }
    
    let validAdvances = (Array.isArray(db.myAdvances) ? db.myAdvances : [db.myAdvances]).filter(adv => adv && getSafeNum(adv?._raw?.['Advances'] || adv?.amount) > 0);

    let rows = '';
    validAdvances.forEach((adv, i) => {
        let rawA = adv._raw || adv;
        let amt = getSafeNum(rawA['Advances'] || rawA['Amount'] || adv.amount);
        let settled = getSafeNum(rawA[' Previously settled ']) + getSafeNum(rawA[' Settled outside of payroll ']);
        
        rows += `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding:8px 0;">Advance ${i+1}<br><small style="color:var(--text-secondary);">${rawA['Date of advance'] || '-'}</small></td>
                <td style="padding:8px 0; text-align:right;">${Math.round(amt).toLocaleString('en-PK')}</td>
                <td style="padding:8px 0; text-align:right;">${Math.round(settled).toLocaleString('en-PK')}</td>
                <td style="padding:8px 0; text-align:right; font-weight:bold; color:var(--krn-orange);">${Math.round(amt - settled).toLocaleString('en-PK')}</td>
            </tr>
        `;
    });

    modal.innerHTML = `
        <div style="background:var(--bg-card); padding:25px; border-radius:12px; width:90%; max-width:600px; color:var(--text-primary); box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
                <h2 style="margin:0; color:var(--krn-blue);">Advances Breakdown</h2>
            </div>
            ${rows ? `
            <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                <thead>
                    <tr style="border-bottom:2px solid var(--border-color); color:var(--text-secondary);">
                        <th style="text-align:left; padding:8px 0;">Detail</th>
                        <th style="text-align:right; padding:8px 0;">Total</th>
                        <th style="text-align:right; padding:8px 0;">Settled</th>
                        <th style="text-align:right; padding:8px 0;">Balance</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>` : '<p style="color:var(--text-secondary);">No active advances.</p>'}
            <div style="text-align:right; margin-top:20px;">
                <button onclick="document.getElementById('advModal').style.display='none'" style="background:var(--krn-blue); color:white; border:none; padding:8px 20px; border-radius:6px; cursor:pointer;">Close</button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

// Attach the click listener to the card once the file loads
setTimeout(() => {
    let advCardEl = document.getElementById('advancesCard');
    if (advCardEl) {
        advCardEl.style.cursor = 'pointer';
        advCardEl.onclick = openAdvancesModal;
    }
}, 500);
