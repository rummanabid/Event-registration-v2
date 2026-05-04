let fields = INITIAL_FIELDS.map(f => ({
  ...f,
  options: f.options ? JSON.parse(f.options) : []
}));

function renderFields() {
  const list = document.getElementById('custom-fields-list');
  const empty = document.getElementById('no-custom-fields');

  if (fields.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  list.innerHTML = fields.map((f, i) => `
    <div class="custom-field-item" data-index="${i}">
      <div class="custom-field-header">
        <span class="field-type-badge">${f.field_type.replace('_', ' ')}</span>
        <div class="field-order-btns">
          <button onclick="moveField(${i}, -1)" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button onclick="moveField(${i}, 1)" title="Move down" ${i === fields.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
      </div>
      <div class="custom-field-controls">
        <input type="text" value="${escHtml(f.label)}" placeholder="Field label"
          oninput="updateField(${i}, 'label', this.value)" style="flex:1;min-width:200px"/>
        <label class="toggle-label">
          <input type="checkbox" ${f.is_required ? 'checked' : ''}
            onchange="updateField(${i}, 'is_required', this.checked)" />
          Required
        </label>
        <button class="btn btn-sm btn-danger" onclick="removeField(${i})">Delete</button>
      </div>
      ${f.field_type === 'dropdown' ? renderDropdownOptions(f, i) : ''}
    </div>
  `).join('');
}

function renderDropdownOptions(f, fieldIndex) {
  const opts = f.options || [];
  return `
    <div class="dropdown-options">
      <div class="text-sm" style="font-weight:600;color:var(--navy);margin-bottom:8px">Options</div>
      <div class="dropdown-options-list" id="opts-${fieldIndex}">
        ${opts.map((opt, oi) => `
          <div class="option-row">
            <input type="text" value="${escHtml(opt)}" placeholder="Option ${oi + 1}"
              oninput="updateOption(${fieldIndex}, ${oi}, this.value)" />
            <button class="btn btn-sm btn-danger" onclick="removeOption(${fieldIndex}, ${oi})">×</button>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-sm btn-outline" onclick="addOption(${fieldIndex})">+ Add Option</button>
    </div>
  `;
}

function addField(type) {
  const { v4: uuid } = { v4: () => crypto.randomUUID() };
  fields.push({
    id: crypto.randomUUID(),
    field_type: type,
    label: type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    is_required: false,
    options: type === 'dropdown' ? ['Option 1'] : []
  });
  renderFields();
}

function removeField(i) {
  fields.splice(i, 1);
  renderFields();
}

function moveField(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= fields.length) return;
  [fields[i], fields[j]] = [fields[j], fields[i]];
  renderFields();
}

function updateField(i, key, val) {
  fields[i][key] = val;
}

function addOption(fieldIndex) {
  if (!fields[fieldIndex].options) fields[fieldIndex].options = [];
  fields[fieldIndex].options.push('');
  renderFields();
}

function removeOption(fieldIndex, optIndex) {
  fields[fieldIndex].options.splice(optIndex, 1);
  renderFields();
}

function updateOption(fieldIndex, optIndex, val) {
  fields[fieldIndex].options[optIndex] = val;
}

function updateStandardField() {
  // Just a hook — values are read at save time
}

async function saveForm() {
  const btn = document.querySelector('.form-builder-save .btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  // Collect current label values from DOM (in case user typed without triggering input)
  document.querySelectorAll('.custom-field-item').forEach((el, i) => {
    const input = el.querySelector('input[type="text"]');
    if (input && fields[i]) fields[i].label = input.value;
  });

  // Standard fields
  const phoneVisible = document.getElementById('phone-visible').checked;
  const phoneRequired = document.getElementById('phone-required').checked;
  const companyVisible = document.getElementById('company-visible').checked;
  const companyRequired = document.getElementById('company-required').checked;

  try {
    const [fcRes, ffRes] = await Promise.all([
      fetch(`/api/events/${EVENT_ID}/field-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: [
            { field_name: 'phone', is_visible: phoneVisible, is_required: phoneRequired },
            { field_name: 'company', is_visible: companyVisible, is_required: companyRequired }
          ]
        })
      }),
      fetch(`/api/events/${EVENT_ID}/form-fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      })
    ]);

    if (fcRes.ok && ffRes.ok) {
      showSaveSuccess();
    } else {
      alert('Failed to save form configuration');
    }
  } catch (err) {
    alert('Network error while saving');
  }

  btn.disabled = false;
  btn.textContent = 'Save Form Configuration';
}

function showSaveSuccess() {
  const btn = document.querySelector('.page-header-actions .btn-primary');
  const orig = btn.textContent;
  btn.textContent = '✓ Saved!';
  btn.style.background = 'var(--green)';
  setTimeout(() => {
    btn.textContent = orig;
    btn.style.background = '';
  }, 2500);
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Init
renderFields();
