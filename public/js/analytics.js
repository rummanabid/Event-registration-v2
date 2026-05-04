async function loadAnalytics() {
  const res = await fetch('/api/analytics/data');
  const data = await res.json();

  renderKPIs(data.totals);
  renderRegistrationsChart(data.chart);
  renderCheckinDonut(data.totals);
  renderEventTable(data.eventStats);
}

function renderKPIs(totals) {
  const rate = totals.total_registrations > 0
    ? Math.round((totals.total_checked_in / totals.total_registrations) * 100)
    : 0;

  const grid = document.getElementById('kpi-grid');
  grid.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-icon kpi-blue">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      </div>
      <div class="kpi-body">
        <div class="kpi-value">${totals.total_events}</div>
        <div class="kpi-label">Total Events</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon kpi-purple">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      </div>
      <div class="kpi-body">
        <div class="kpi-value">${totals.total_registrations}</div>
        <div class="kpi-label">Total Registrations</div>
        ${totals.total_waitlisted > 0 ? `<div class="kpi-sub">${totals.total_waitlisted} on waitlist</div>` : ''}
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon kpi-green">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      </div>
      <div class="kpi-body">
        <div class="kpi-value">${totals.total_checked_in}</div>
        <div class="kpi-label">Checked In</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon kpi-orange">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
      </div>
      <div class="kpi-body">
        <div class="kpi-value">${rate}%</div>
        <div class="kpi-label">Check-in Rate</div>
      </div>
    </div>
  `;
}

function renderRegistrationsChart(chart) {
  const ctx = document.getElementById('registrations-chart').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: chart.days,
      datasets: [{
        label: 'Registrations',
        data: chart.counts,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,.1)',
        borderWidth: 2.5,
        pointRadius: 4,
        pointBackgroundColor: '#2563eb',
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,.05)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderCheckinDonut(totals) {
  const notCheckedIn = totals.total_registrations - totals.total_checked_in;
  const ctx = document.getElementById('checkin-rate-chart').getContext('2d');
  const rate = totals.total_registrations > 0
    ? Math.round((totals.total_checked_in / totals.total_registrations) * 100) : 0;

  document.getElementById('checkin-rate-label').textContent = `${rate}%`;

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Checked In', 'Not Yet'],
      datasets: [{
        data: [totals.total_checked_in || 0, notCheckedIn || 0],
        backgroundColor: ['#16a34a', '#e2e8f0'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      cutout: '72%',
      plugins: {
        legend: { position: 'bottom', labels: { padding: 16, font: { size: 13 } } }
      }
    }
  });
}

function renderEventTable(eventStats) {
  const container = document.getElementById('event-table-container');
  if (eventStats.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No events yet.</p></div>';
    return;
  }

  const rows = eventStats.map(e => {
    const rate = e.registrations > 0 ? Math.round((e.checked_in / e.registrations) * 100) : 0;
    const rateBg = rate >= 80 ? '#f0fdf4' : rate >= 50 ? '#fffbeb' : '#f8fafc';
    const rateColor = rate >= 80 ? '#16a34a' : rate >= 50 ? '#d97706' : '#64748b';
    const capacityInfo = e.capacity ? `${e.registrations}/${e.capacity}` : e.registrations;
    return `
      <tr>
        <td><strong>${escHtml(e.name)}</strong></td>
        <td>${e.date ? new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
        <td>${capacityInfo}</td>
        <td>${e.checked_in}</td>
        <td>${e.waitlisted > 0 ? e.waitlisted : '—'}</td>
        <td>
          <span style="background:${rateBg};color:${rateColor};padding:3px 10px;border-radius:12px;font-weight:700;font-size:.82rem">${rate}%</span>
        </td>
        <td>
          <a href="/admin#event-${e.id}" class="btn btn-sm btn-outline">Manage</a>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="reg-table-wrapper">
      <table class="reg-table">
        <thead>
          <tr>
            <th>Event</th><th>Date</th><th>Registered</th>
            <th>Checked In</th><th>Waitlist</th><th>Rate</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

loadAnalytics();
// Refresh every 30 seconds
setInterval(loadAnalytics, 30000);
