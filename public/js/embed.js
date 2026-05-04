async function submitRegistration(e) {
  e.preventDefault();
  const form = document.getElementById('reg-form');
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Registering...';

  const formData = new FormData(form);
  const body = {
    event_id: formData.get('event_id'),
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    phone: formData.get('phone') || null,
    company: formData.get('company') || null,
    custom_data: {}
  };

  for (const [key, val] of formData.entries()) {
    if (key.startsWith('custom_')) {
      const fieldId = key.replace('custom_', '');
      body.custom_data[fieldId] = val;
    }
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      const data = await res.json();
      const embedParam = IS_EMBED ? '&embed=true' : '';
      window.location.href = `/register-success?reg_id=${data.id}${embedParam}`;
    } else {
      const data = await res.json();
      alert(data.error || 'Registration failed. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Register Now';
    }
  } catch (err) {
    alert('Network error. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Register Now';
  }
}
