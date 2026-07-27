document.addEventListener('DOMContentLoaded', () => {
    
    const btnCreateInvoice = document.getElementById('btnCreateInvoice');
    const invoiceList = document.getElementById('invoiceList');
    const storeBalance = document.getElementById('storeBalance');
    const btnRefreshBalance = document.getElementById('btnRefreshBalance');
    const oracleTotal = document.getElementById('oracleTotal');
    const oraclePaid = document.getElementById('oraclePaid');
    const btnRefreshOracle = document.getElementById('btnRefreshOracle');
    const btnRunReconcile = document.getElementById('btnRunReconcile');
    
    // Progress elements
    const jobProgressContainer = document.getElementById('jobProgressContainer');
    const jobStatusText = document.getElementById('jobStatusText');
    const jobPercentage = document.getElementById('jobPercentage');
    const jobProgressBar = document.getElementById('jobProgressBar');
    const jobDetails = document.getElementById('jobDetails');

    let pollInterval = null;

    // --- API Calls ---

    async function fetchBalance() {
        try {
            const res = await fetch('/api/explorer/balance');
            const data = await res.json();
            storeBalance.innerText = `${data.balance} KAS`;
        } catch (e) {
            console.error(e);
        }
    }

    async function fetchOracleMetrics() {
        try {
            const res = await fetch('/api/oracle/metrics');
            const data = await res.json();
            oracleTotal.innerText = data.totalInvoices;
            oraclePaid.innerText = data.paidInvoices;
        } catch (e) {
            console.error(e);
        }
    }

    // --- Event Listeners ---

    btnRefreshBalance.addEventListener('click', fetchBalance);
    btnRefreshOracle.addEventListener('click', fetchOracleMetrics);

    btnCreateInvoice.addEventListener('click', async () => {
        try {
            btnCreateInvoice.disabled = true;
            btnCreateInvoice.innerText = 'Creating...';
            
            const res = await fetch('/api/payments/invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: 100 })
            });
            const data = await res.json();
            
            const item = document.createElement('div');
            item.className = 'invoice-item';
            item.innerHTML = `
                <span>Inv: ${data.invoiceId.substring(0,6)}...</span>
                <button class="btn success" style="width: auto; padding: 0.25rem 0.75rem;" onclick="simulatePayment('${data.invoiceId}', this)">Pay 100 KAS</button>
            `;
            invoiceList.prepend(item);

            await fetchOracleMetrics();
        } catch (e) {
            console.error(e);
        } finally {
            btnCreateInvoice.disabled = false;
            btnCreateInvoice.innerText = 'Create Invoice (100 KAS)';
        }
    });

    window.simulatePayment = async (invoiceId, btnElement) => {
        try {
            btnElement.disabled = true;
            btnElement.innerText = 'Paying...';
            
            await fetch('/api/payments/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoiceId })
            });
            
            btnElement.innerText = 'Paid ✓';
            btnElement.style.background = 'var(--text-secondary)';
            
            // Auto refresh
            fetchBalance();
            fetchOracleMetrics();
        } catch (e) {
            console.error(e);
            btnElement.disabled = false;
            btnElement.innerText = 'Retry Payment';
        }
    };

    btnRunReconcile.addEventListener('click', async () => {
        try {
            btnRunReconcile.disabled = true;
            const res = await fetch('/api/jobs/reconcile', { method: 'POST' });
            const data = await res.json();
            
            startPollingJob(data.id);
        } catch (e) {
            console.error(e);
            btnRunReconcile.disabled = false;
        }
    });

    // --- Job Polling ---

    function startPollingJob(jobId) {
        jobProgressContainer.classList.remove('hidden');
        if (pollInterval) clearInterval(pollInterval);
        
        pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/jobs/${jobId}`);
                const job = await res.json();
                
                const p = job.progress;
                const perc = Math.round(p.percentage);
                
                jobStatusText.innerText = `Status: ${job.status.toUpperCase()}`;
                jobPercentage.innerText = `${perc}%`;
                jobProgressBar.style.width = `${perc}%`;
                jobDetails.innerText = `${p.processed + p.failed} / ${p.total} processed`;

                if (job.status === 'completed' || job.status === 'failed') {
                    clearInterval(pollInterval);
                    btnRunReconcile.disabled = false;
                    if (job.status === 'completed') {
                        jobProgressBar.style.background = 'var(--success)';
                    } else {
                        jobProgressBar.style.background = '#ef4444'; // red
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }, 500); // 500ms poll for smooth UI update
    }

    // Initial load
    fetchBalance();
    fetchOracleMetrics();
});
