/* ==========================================================================
   2FA Auth - Full Interactive Client Logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // --- State Variables ---
    let currentTab = 'single';
    let vaultAccounts = JSON.parse(localStorage.getItem('2fa_vault_accounts') || '[]');
    let timerInterval = null;

    // --- DOM Elements ---
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabPages = document.querySelectorAll('.tab-page');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const serverClockEl = document.getElementById('server-clock');

    // Single Generator DOM
    const secretInput = document.getElementById('secret-input');
    const clearSingleBtn = document.getElementById('clear-single-btn');
    const pasteSingleBtn = document.getElementById('paste-single-btn');
    const totpDisplayBox = document.getElementById('totp-display-container');
    const emptyPrompt = totpDisplayBox.querySelector('.empty-prompt');
    const totpActiveContent = totpDisplayBox.querySelector('.totp-active-content');
    const displayAccountName = document.getElementById('display-account-name');
    const totpCodeOutput = document.getElementById('totp-code-output');
    const copyCodeBtn = document.getElementById('copy-code-btn');
    const timerRing = document.getElementById('timer-ring');
    const timerSecondsNum = document.getElementById('timer-seconds-num');
    const cleanSecretText = document.getElementById('clean-secret-text');
    const saveToVaultBtn = document.getElementById('save-to-vault-btn');
    const genQrBtn = document.getElementById('gen-qr-btn');

    // Batch Generator DOM
    const batchTextarea = document.getElementById('batch-textarea');
    const batchProcessBtn = document.getElementById('batch-process-btn');
    const batchClearBtn = document.getElementById('batch-clear-btn');
    const batchResultsList = document.getElementById('batch-results-list');
    const batchSearchInput = document.getElementById('batch-search-input');
    const copyAllBatchBtn = document.getElementById('copy-all-batch-btn');
    const exportCsvBtn = document.getElementById('export-csv-btn');

    // Vault DOM
    const vaultCountBadge = document.getElementById('vault-count');
    const vaultCardsGrid = document.getElementById('vault-cards-grid');
    const vaultSearchInput = document.getElementById('vault-search-input');
    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const exportVaultBtn = document.getElementById('export-vault-btn');
    const importVaultBtn = document.getElementById('import-vault-btn');
    const vaultFileInput = document.getElementById('vault-file-input');

    // Vault Modal DOM
    const vaultModal = document.getElementById('vault-modal');
    const modalTitle = document.getElementById('modal-title');
    const vaultForm = document.getElementById('vault-form');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelModalBtn = document.getElementById('cancel-modal-btn');

    // QR Tools DOM
    const qrGenSecret = document.getElementById('qr-gen-secret');
    const qrGenIssuer = document.getElementById('qr-gen-issuer');
    const qrGenAccount = document.getElementById('qr-gen-account');
    const qrcodeRenderTarget = document.getElementById('qrcode-render-target');
    const qrRenderTip = document.getElementById('qr-render-tip');
    const qrDropzone = document.getElementById('qr-dropzone');
    const qrFileInput = document.getElementById('qr-file-input');
    const qrReaderResult = document.getElementById('qr-reader-result');
    const scannedSecret = document.getElementById('scanned-secret');
    const scannedUri = document.getElementById('scanned-uri');
    const copyScannedSecret = document.getElementById('copy-scanned-secret');
    const useScannedBtn = document.getElementById('use-scanned-btn');

    // --- Tab Switching ---
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            navButtons.forEach(b => b.classList.remove('active'));
            tabPages.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(`tab-${targetTab}`).classList.add('active');
            currentTab = targetTab;
        });
    });

    // --- Theme Toggle ---
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');
        themeToggleBtn.innerHTML = isLight ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
        localStorage.setItem('2fa_theme', isLight ? 'light' : 'dark');
    });

    if (localStorage.getItem('2fa_theme') === 'light') {
        document.body.classList.add('light-theme');
        themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }

    // --- Clock Tick ---
    function updateClock() {
        const now = new Date();
        serverClockEl.textContent = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
        
        // Timer Ring Logic for Single Tab
        const seconds = now.getUTCSeconds() % 30;
        const remaining = 30 - seconds;
        timerSecondsNum.textContent = remaining;

        // Total circumference of circle r=42 is ~263.89
        const dashOffset = (seconds / 30) * 263.89;
        timerRing.style.strokeDashoffset = dashOffset;

        // If seconds == 0, auto refresh codes
        if (seconds === 0 || timerSecondsNum.textContent === "30") {
            refreshAllCodes();
        }
    }

    setInterval(updateClock, 1000);
    updateClock();

    // --- Toast Notifications ---
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let icon = 'fa-circle-info';
        if (type === 'success') icon = 'fa-circle-check';
        if (type === 'error') icon = 'fa-circle-exclamation';

        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    // --- Single Generator Logic ---
    async function calculateSingleTotp() {
        const input = secretInput.value.trim();
        if (!input) {
            emptyPrompt.classList.remove('hidden');
            totpActiveContent.classList.add('hidden');
            totpDisplayBox.classList.add('empty-state');
            return;
        }

        try {
            const response = await fetch('/api/2fa/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret: input })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || '无效的密钥');
            }

            const data = await response.json();
            
            emptyPrompt.classList.add('hidden');
            totpActiveContent.classList.remove('hidden');
            totpDisplayBox.classList.remove('empty-state');

            // Format code with space: e.g. "839 204"
            const rawCode = data.code;
            const formattedCode = rawCode.length === 6 ? `${rawCode.substring(0, 3)} ${rawCode.substring(3)}` : rawCode;
            totpCodeOutput.textContent = formattedCode;
            
            displayAccountName.textContent = data.account ? `${data.issuer ? data.issuer + ': ' : ''}${data.account}` : '通用 2FA 账号';
            cleanSecretText.textContent = data.secret;
        } catch (e) {
            emptyPrompt.classList.remove('hidden');
            totpActiveContent.classList.add('hidden');
            totpDisplayBox.classList.add('empty-state');
        }
    }

    secretInput.addEventListener('input', calculateSingleTotp);

    clearSingleBtn.addEventListener('click', () => {
        secretInput.value = '';
        calculateSingleTotp();
    });

    pasteSingleBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                secretInput.value = text.trim();
                calculateSingleTotp();
                showToast('已从剪贴板粘贴密钥', 'success');
            }
        } catch (err) {
            showToast('无法读取剪贴板，请手动粘贴', 'error');
        }
    });

    copyCodeBtn.addEventListener('click', () => {
        const code = totpCodeOutput.textContent.replace(/\s+/g, '');
        if (code && code !== '------') {
            navigator.clipboard.writeText(code);
            showToast(`已复制验证码: ${code}`, 'success');
        }
    });

    saveToVaultBtn.addEventListener('click', () => {
        const secret = cleanSecretText.textContent;
        if (!secret || secret === '---') return;

        document.getElementById('modal-issuer').value = displayAccountName.textContent.split(':')[0] || '通用';
        document.getElementById('modal-account').value = displayAccountName.textContent.split(':')[1] || 'Default';
        document.getElementById('modal-secret').value = secret;
        document.getElementById('modal-account-id').value = '';

        modalTitle.innerHTML = '<i class="fa-solid fa-bookmark"></i> 保存到保管箱';
        vaultModal.classList.remove('hidden');
    });

    genQrBtn.addEventListener('click', () => {
        const secret = cleanSecretText.textContent;
        if (!secret || secret === '---') return;

        navButtons[3].click(); // Switch to QR tab
        qrGenSecret.value = secret;
        qrGenIssuer.value = displayAccountName.textContent.split(':')[0] || '';
        qrGenAccount.value = displayAccountName.textContent.split(':')[1] || '';
        updateQrCode();
    });

    // --- Batch Generator Logic ---
    async function processBatch() {
        const lines = batchTextarea.value.split('\n').filter(l => l.trim().length > 0);
        if (lines.length === 0) {
            showToast('请输入至少一行 2FA 密钥', 'error');
            return;
        }

        try {
            const response = await fetch('/api/2fa/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secrets: lines })
            });

            const data = await response.json();
            renderBatchResults(data);
            showToast(`成功生成 ${data.length} 条 2FA 验证码`, 'success');
        } catch (err) {
            showToast('批量计算失败: ' + err.message, 'error');
        }
    }

    function renderBatchResults(results) {
        batchResultsList.innerHTML = '';
        const filter = batchSearchInput.value.toLowerCase().trim();

        results.forEach((item, index) => {
            if (!item.success) return;

            const d = item.data;
            const accountLabel = d.account ? `${d.issuer ? d.issuer + ': ' : ''}${d.account}` : `账号 #${index + 1}`;
            
            if (filter && !accountLabel.toLowerCase().includes(filter) && !d.code.includes(filter)) {
                return;
            }

            const formattedCode = d.code.length === 6 ? `${d.code.substring(0, 3)} ${d.code.substring(3)}` : d.code;

            const card = document.createElement('div');
            card.className = 'batch-item-card';
            card.innerHTML = `
                <div class="batch-item-info">
                    <span class="account-name">${accountLabel}</span>
                    <span class="secret-sub mono" style="font-size: 0.78rem; color: var(--text-muted);">${d.secret}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <span class="batch-item-code">${formattedCode}</span>
                    <button class="btn btn-sm btn-secondary copy-batch-single" data-code="${d.code}"><i class="fa-regular fa-copy"></i></button>
                </div>
            `;

            card.querySelector('.copy-batch-single').addEventListener('click', (e) => {
                const code = e.currentTarget.dataset.code;
                navigator.clipboard.writeText(code);
                showToast(`已复制: ${code}`, 'success');
            });

            batchResultsList.appendChild(card);
        });
    }

    batchProcessBtn.addEventListener('click', processBatch);

    batchClearBtn.addEventListener('click', () => {
        batchTextarea.value = '';
        batchResultsList.innerHTML = '<div class="empty-prompt"><i class="fa-solid fa-table-list"></i><p>请在左侧输入多行 2FA 密钥并点击“批量生成”</p></div>';
    });

    batchSearchInput.addEventListener('input', () => {
        const cards = batchResultsList.querySelectorAll('.batch-item-card');
        const filter = batchSearchInput.value.toLowerCase().trim();
        cards.forEach(card => {
            const text = card.textContent.toLowerCase();
            card.style.display = text.includes(filter) ? 'flex' : 'none';
        });
    });

    copyAllBatchBtn.addEventListener('click', () => {
        const codes = Array.from(batchResultsList.querySelectorAll('.batch-item-code')).map(el => el.textContent.replace(/\s+/g, ''));
        if (codes.length === 0) return;

        navigator.clipboard.writeText(codes.join('\n'));
        showToast(`已复制全部 ${codes.length} 条验证码`, 'success');
    });

    exportCsvBtn.addEventListener('click', () => {
        const cards = batchResultsList.querySelectorAll('.batch-item-card');
        if (cards.length === 0) return;

        let csv = 'Account,Secret,Code\n';
        cards.forEach(card => {
            const acc = card.querySelector('.account-name').textContent;
            const sec = card.querySelector('.secret-sub').textContent;
            const code = card.querySelector('.batch-item-code').textContent.replace(/\s+/g, '');
            csv += `"${acc}","${sec}","${code}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `2fa_batch_${Date.now()}.csv`;
        link.click();
        showToast('已导出 2FA 验证码 CSV 文件', 'success');
    });

    // --- Vault Logic ---
    function renderVault() {
        vaultAccounts = JSON.parse(localStorage.getItem('2fa_vault_accounts') || '[]');
        vaultCountBadge.textContent = vaultAccounts.length;
        vaultCardsGrid.innerHTML = '';

        if (vaultAccounts.length === 0) {
            vaultCardsGrid.innerHTML = '<div class="empty-prompt" style="grid-column: 1/-1; padding: 3rem;"><i class="fa-solid fa-box-open"></i><p>保管箱暂无账号，点击右上角“添加新账号”按钮新增</p></div>';
            return;
        }

        const filter = vaultSearchInput.value.toLowerCase().trim();

        vaultAccounts.forEach((acc, index) => {
            if (filter && !acc.issuer.toLowerCase().includes(filter) && !acc.account.toLowerCase().includes(filter)) {
                return;
            }

            const card = document.createElement('div');
            card.className = 'vault-card';
            card.innerHTML = `
                <div class="vault-card-header">
                    <span class="issuer-tag"><i class="fa-solid fa-shield-cat text-accent"></i> ${acc.issuer}</span>
                    <button class="icon-btn delete-vault-btn" data-index="${index}" style="width:28px; height:28px;"><i class="fa-solid fa-trash"></i></button>
                </div>
                <span class="account-email">${acc.account}</span>
                <div class="vault-code-display" data-secret="${acc.secret}" title="点击复制">
                    <span class="vault-code-val">------</span>
                    <i class="fa-regular fa-copy" style="font-size: 1rem;"></i>
                </div>
            `;

            card.querySelector('.vault-code-display').addEventListener('click', (e) => {
                const code = card.querySelector('.vault-code-val').textContent.replace(/\s+/g, '');
                if (code && code !== '------') {
                    navigator.clipboard.writeText(code);
                    showToast(`已复制 ${acc.issuer} 验证码: ${code}`, 'success');
                }
            });

            card.querySelector('.delete-vault-btn').addEventListener('click', (e) => {
                const idx = e.currentTarget.dataset.index;
                vaultAccounts.splice(idx, 1);
                localStorage.setItem('2fa_vault_accounts', JSON.stringify(vaultAccounts));
                renderVault();
                showToast('已删除账号', 'info');
            });

            vaultCardsGrid.appendChild(card);
        });

        refreshVaultCodes();
    }

    async function refreshVaultCodes() {
        const cards = vaultCardsGrid.querySelectorAll('.vault-card');
        cards.forEach(async card => {
            const display = card.querySelector('.vault-code-display');
            const secret = display.dataset.secret;
            try {
                const res = await fetch('/api/2fa/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ secret })
                });
                if (res.ok) {
                    const data = await res.json();
                    const code = data.code;
                    card.querySelector('.vault-code-val').textContent = code.length === 6 ? `${code.substring(0, 3)} ${code.substring(3)}` : code;
                }
            } catch (e) {}
        });
    }

    vaultSearchInput.addEventListener('input', renderVault);

    openAddModalBtn.addEventListener('click', () => {
        vaultForm.reset();
        document.getElementById('modal-account-id').value = '';
        modalTitle.innerHTML = '<i class="fa-solid fa-plus"></i> 添加 2FA 账号';
        vaultModal.classList.remove('hidden');
    });

    closeModalBtn.addEventListener('click', () => vaultModal.classList.add('hidden'));
    cancelModalBtn.addEventListener('click', () => vaultModal.classList.add('hidden'));

    vaultForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const issuer = document.getElementById('modal-issuer').value.trim();
        const account = document.getElementById('modal-account').value.trim();
        const secret = document.getElementById('modal-secret').value.trim();

        vaultAccounts.push({ issuer, account, secret });
        localStorage.setItem('2fa_vault_accounts', JSON.stringify(vaultAccounts));

        vaultModal.classList.add('hidden');
        renderVault();
        showToast('新 2FA 账号已保存至保管箱', 'success');
    });

    exportVaultBtn.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(vaultAccounts, null, 2));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute("href", dataStr);
        dlAnchor.setAttribute("download", `2fa_vault_backup_${Date.now()}.json`);
        dlAnchor.click();
        showToast('保管箱备份下载完成', 'success');
    });

    importVaultBtn.addEventListener('click', () => vaultFileInput.click());

    vaultFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                if (Array.isArray(imported)) {
                    vaultAccounts = vaultAccounts.concat(imported);
                    localStorage.setItem('2fa_vault_accounts', JSON.stringify(vaultAccounts));
                    renderVault();
                    showToast(`成功导入 ${imported.length} 个账号`, 'success');
                }
            } catch (err) {
                showToast('读取备份 JSON 文件失败', 'error');
            }
        };
        reader.readAsText(file);
    });

    // --- QR Tools Logic ---
    let qrcodeObj = null;

    function updateQrCode() {
        const secret = qrGenSecret.value.trim();
        const issuer = qrGenIssuer.value.trim() || '2FAAuth';
        const account = qrGenAccount.value.trim() || 'User';

        qrcodeRenderTarget.innerHTML = '';
        if (!secret) {
            qrRenderTip.style.display = 'block';
            return;
        }

        qrRenderTip.style.display = 'none';
        const otpauthUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}`;

        qrcodeObj = new QRCode(qrcodeRenderTarget, {
            text: otpauthUri,
            width: 180,
            height: 180,
            colorDark: "#0f172a",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    [qrGenSecret, qrGenIssuer, qrGenAccount].forEach(el => el.addEventListener('input', updateQrCode));

    // QR Scan / Dropzone
    qrDropzone.addEventListener('click', () => qrFileInput.click());

    qrDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        qrDropzone.style.borderColor = 'var(--accent-color)';
    });

    qrDropzone.addEventListener('dragleave', () => {
        qrDropzone.style.borderColor = 'var(--border-color)';
    });

    qrDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        qrDropzone.style.borderColor = 'var(--border-color)';
        if (e.dataTransfer.files.length > 0) {
            handleQrImageFile(e.dataTransfer.files[0]);
        }
    });

    qrFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleQrImageFile(e.target.files[0]);
        }
    });

    function handleQrImageFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);

                if (code) {
                    scannedUri.textContent = code.data;
                    let secret = code.data;
                    if (code.data.startsWith('otpauth://')) {
                        const match = code.data.match(/secret=([A-Za-z2-7]+)/i);
                        if (match) secret = match[1];
                    }

                    scannedSecret.textContent = secret;
                    qrReaderResult.classList.remove('hidden');
                    showToast('二维码解析成功!', 'success');
                } else {
                    showToast('未能识别有效的 2FA 二维码图片', 'error');
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    copyScannedSecret.addEventListener('click', () => {
        navigator.clipboard.writeText(scannedSecret.textContent);
        showToast('已复制识别出的 2FA 密钥', 'success');
    });

    useScannedBtn.addEventListener('click', () => {
        secretInput.value = scannedSecret.textContent;
        navButtons[0].click(); // Switch to Single tab
        calculateSingleTotp();
    });

    // Refresh all codes tick
    function refreshAllCodes() {
        if (currentTab === 'single') calculateSingleTotp();
        if (currentTab === 'batch') processBatch();
        if (currentTab === 'vault') refreshVaultCodes();
    }

    // Initial render
    renderVault();
});
