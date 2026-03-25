export function escapeHtml(value) {
    if (value == null) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(value).replace(/[&<>"']/g, (char) => map[char]);
}

function field(label, value) {
    if (!value) return '';
    return `<span class="lead-tag"><strong>${escapeHtml(label)}</strong>${escapeHtml(String(value))}</span>`;
}

export function renderInquiries(container, inquiries) {
    if (!container) return;

    if (!Array.isArray(inquiries) || inquiries.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;">
                <p style="font-size:1.1rem;">No inquiries yet.</p>
                <p style="margin-top:10px;">They will appear here as visitors chat with the bot.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = inquiries.map((inquiry) => {
        const contact = inquiry.contact || {};
        const details = inquiry.details || {};
        const businessIdea = inquiry.businessIdea || '';
        const filename = escapeHtml(inquiry.filename || '');
        const scoreText = inquiry.leadScore != null ? `Score: ${escapeHtml(inquiry.leadScore)}` : '';

        return `
            <article class="inquiry-card">
                <div class="inquiry-header">
                    <div class="contact-info">
                        <h3>${escapeHtml(contact.name || 'Unknown')}</h3>
                        <p>Email: ${escapeHtml(contact.email || 'N/A')}</p>
                        <p>Phone: ${escapeHtml(contact.phone || 'N/A')}</p>
                        ${contact.company ? `<p>Company: ${escapeHtml(contact.company)}</p>` : ''}
                    </div>
                    <span class="timestamp">
                        ${escapeHtml(new Date(inquiry.timestamp).toLocaleDateString())}<br>
                        <span style="font-size:0.7rem;color:var(--text-muted);">${scoreText}</span>
                    </span>
                </div>

                ${businessIdea ? `
                    <div class="business-idea">
                        <p><strong>Summary</strong></p>
                        <p>${escapeHtml(businessIdea.substring(0, 280))}${businessIdea.length > 280 ? '…' : ''}</p>
                    </div>
                ` : ''}

                <div class="lead-fields">
                    ${field('Industry:', details.industry || contact.industry)}
                    ${field('Problem:', details.problem)}
                    ${field('Target:', details.targetCustomer)}
                    ${field('Goal:', details.goal)}
                    ${field('Timeline:', details.timeline)}
                    ${field('Budget:', details.budgetRange)}
                    ${field('Urgency:', details.urgencyLevel)}
                    ${field('Current solution:', details.currentSolution)}
                    ${details.consentToContact ? '<span class="lead-tag"><strong>Yes</strong>Consent given</span>' : ''}
                </div>

                <div class="action-buttons">
                    <button class="btn-small btn-copy" type="button" data-action="copy-inquiry" data-id="${filename}">Copy</button>
                    <button class="btn-small btn-delete" type="button" data-action="delete-inquiry" data-id="${filename}">Delete</button>
                </div>
            </article>
        `;
    }).join('');
}

export function renderProjects(container, projects) {
    if (!container) return;

    if (!Array.isArray(projects) || projects.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 25px 10px;">
                <p>No published projects yet.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = projects.map((project) => {
        const titlePt = escapeHtml(project && project.title && project.title.pt || 'Untitled');
        const titleEn = escapeHtml(project && project.title && project.title.en || '');
        const id = escapeHtml(project && project.id || '');
        const sector = escapeHtml(project && project.sector && (project.sector.pt || project.sector.en) || '');

        return `
            <article class="project-item">
                <h3>${titlePt}</h3>
                ${titleEn ? `<p><strong>EN:</strong> ${titleEn}</p>` : ''}
                <p><strong>ID:</strong> ${id || '-'}</p>
                <p><strong>Sector:</strong> ${sector || '-'}</p>
                <div class="project-item-actions">
                    <button class="btn-small btn-copy" type="button" data-action="copy-project" data-id="${id}">Copy JSON</button>
                    <button class="btn-small btn-delete" type="button" data-action="delete-project" data-id="${id}">Delete</button>
                </div>
            </article>
        `;
    }).join('');
}
