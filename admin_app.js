// ========================================================================
// CONFIG — replace with the real OAuth Client ID from Google Cloud Console.
// Client IDs are not secret; it's normal and expected for this to be
// visible in client-side code (unlike the session secret, which never
// appears here or anywhere in the frontend).
// ========================================================================
const GOOGLE_CLIENT_ID = "1037167927331-8ct03mk4300g55q7uae73qq5jjhah0cg.apps.googleusercontent.com";

function fmt(n) {
    return Math.round(n || 0).toLocaleString('en-PK');
}

function showLogin(errorMsg) {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('dashboardScreen').style.display = 'none';
    if (errorMsg) {
        let el = document.getElementById('loginError');
        el.style.display = 'block';
    }
}

function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboardScreen').style.display = 'block';
}

async function handleCredentialResponse(response) {
    try {
        const res = await fetch('/api/admin-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ idToken: response.credential }),
        });
        if (!res.ok) {
            showLogin(true);
            return;
        }
        showDashboard();
        loadSummary();
    } catch (e) {
        showLogin(true);
    }
}

function logoutAdmin() {
    fetch('/api/admin-logout', { method: 'POST', credentials: 'include' })
        .finally(() => { window.location.reload(); });
}

function renderTotalsGrid(totals) {
    const grid = document.getElementById('totalsGrid');
    const cards = [
        {
            title: 'Provident Fund', key: 'pf',
            rows: [['Opening', totals.pf.opening], ['Accrued this year', totals.pf.accrued]],
        },
        {
            title: 'Gratuity', key: 'gratuity',
            rows: [],
            note: 'Base Salary \u00f7 2 \u00d7 years served from 1-Jul-2023 (or joining date if later). Employees under 3 years\u2019 service contribute PKR 0.',
        },
        {
            title: 'Training Budget', key: 'training',
            rows: [['Opening', totals.training.opening], ['Accrued this year', totals.training.accrued]],
        },
        {
            title: 'Salary Advances', key: 'advances',
            rows: [['Opening', totals.advances.opening], ['New this year', totals.advances.new], ['Settled this year', -totals.advances.settled]],
        },
    ];

    grid.innerHTML = cards.map(c => `
        <div class="total-card">
            <h3>${c.title}</h3>
            <div class="big">${fmt(totals[c.key].total)} <span style="font-size:0.9rem; color:var(--text-secondary); font-family:inherit;">PKR</span></div>
            <div class="rows">
                ${c.rows.map(([label, val]) => `<div class="row"><span>${label}</span><strong>${val < 0 ? '-' : ''}${fmt(Math.abs(val))}</strong></div>`).join('')}
            </div>
            ${c.note ? `<div style="font-size:0.68rem; color:var(--text-secondary); margin-top:10px;">${c.note}</div>` : ''}
        </div>
    `).join('');
}

function renderDeptTable(byDepartment) {
    const tbody = document.querySelector('#deptTable tbody');
    const depts = Object.keys(byDepartment).sort();
    tbody.innerHTML = depts.map(d => {
        const b = byDepartment[d];
        return `<tr>
            <td class="text-cell">${d}</td>
            <td>${fmt(b.pf.total)}</td>
            <td>${fmt(b.gratuity.total)}</td>
            <td>${fmt(b.training.total)}</td>
            <td>${fmt(b.advances.total)}</td>
        </tr>`;
    }).join('');
}

function renderLeaseTable(lease) {
    const tbody = document.querySelector('#leaseTable tbody');
    tbody.innerHTML = lease.map(l => `
        <tr>
            <td class="text-cell">${l.employeeName} <span style="color:var(--text-secondary); font-size:0.75rem;">(${l.employeeCode})</span></td>
            <td class="text-cell">${l.department}</td>
            <td class="text-cell"><span class="badge ${l.eligible ? 'yes' : 'no'}">${l.eligible ? 'Eligible' : 'Not eligible'}</span></td>
            <td>${fmt(l.leaseLimit)}</td>
        </tr>
    `).join('');
}

async function loadSummary() {
    const loadingMsg = document.getElementById('loadingMsg');
    const errorMsg = document.getElementById('errorMsg');
    const contentArea = document.getElementById('contentArea');

    loadingMsg.style.display = 'block';
    errorMsg.style.display = 'none';
    contentArea.style.display = 'none';

    try {
        const res = await fetch('/api/admin-summary', { credentials: 'include' });
        if (res.status === 401) {
            showLogin(false);
            return;
        }
        if (!res.ok) throw new Error('Request failed');
        const data = await res.json();

        document.getElementById('asOfLine').innerText = `${data.employeeCount} employees \u00b7 as of ${new Date(data.asOf).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`;
        renderTotalsGrid(data.totals);
        renderDeptTable(data.byDepartment);
        renderLeaseTable(data.lease);

        loadingMsg.style.display = 'none';
        contentArea.style.display = 'block';
    } catch (e) {
        loadingMsg.style.display = 'none';
        errorMsg.style.display = 'block';
        errorMsg.innerText = 'Could not load company data. Please refresh and try again.';
    }
}

// ========================================================================
// INIT
// ========================================================================
window.onload = function () {
    if (window.google && window.google.accounts) {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleCredentialResponse,
        });
        google.accounts.id.renderButton(
            document.getElementById('googleBtnContainer'),
            { theme: 'outline', size: 'large', text: 'signin_with' }
        );
    }

    // Reveal the dashboard shell first so loadSummary()'s own loading/error
    // states are visible; it falls back to the login screen itself if
    // there's no valid session (401).
    showDashboard();
    loadSummary();
};
