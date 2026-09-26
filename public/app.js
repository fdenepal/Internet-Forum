const themeToggle = document.querySelector('.theme-toggle');
const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.primary-nav');
const formDialog = document.querySelector('.form-dialog');
const registrationForm = document.querySelector('#registration-form');
const formStatus = document.querySelector('.form-status');
const dialogTitle = document.querySelector('#form-title');
const submitButton = registrationForm.querySelector('[type="submit"]');
const themePreference = localStorage.getItem('nif-theme');
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  localStorage.setItem('nif-theme', theme);
}

applyTheme(themePreference || (systemPrefersDark ? 'dark' : 'light'));
themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

menuToggle.addEventListener('click', () => {
  const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!isExpanded));
  menuToggle.setAttribute('aria-label', isExpanded ? 'Open navigation' : 'Close navigation');
  navigation.classList.toggle('is-open', !isExpanded);
});
navigation.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  navigation.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open navigation');
}));

const typeLabels = {
  attend: 'Be part of the conversation.',
  session: 'Bring your idea to the table.',
  speaker: 'Share your expertise.',
  partner: 'Help shape the gathering.'
};

function openForm(type) {
  registrationForm.reset();
  clearErrors();
  formStatus.textContent = '';
  formStatus.className = 'form-status';
  registrationForm.elements.submissionType.value = type;
  dialogTitle.textContent = typeLabels[type] || typeLabels.attend;
  if (typeof formDialog.showModal === 'function') formDialog.showModal();
  else formDialog.setAttribute('open', '');
  registrationForm.elements.name.focus();
}

document.querySelectorAll('[data-open-form]').forEach((button) => {
  button.addEventListener('click', () => openForm(button.dataset.openForm));
});
document.querySelector('.dialog-close').addEventListener('click', () => formDialog.close());
formDialog.addEventListener('click', (event) => {
  if (event.target === formDialog) formDialog.close();
});

function clearErrors() {
  registrationForm.querySelectorAll('.field-error').forEach((error) => { error.textContent = ''; });
  registrationForm.querySelectorAll('[aria-invalid="true"]').forEach((field) => field.removeAttribute('aria-invalid'));
}

function showErrors(errors) {
  clearErrors();
  Object.entries(errors).forEach(([name, message]) => {
    const field = registrationForm.elements[name];
    if (!field) return;
    field.setAttribute('aria-invalid', 'true');
    const messageElement = field.closest('.field')?.querySelector('.field-error');
    if (messageElement) messageElement.textContent = message;
  });
  registrationForm.querySelector('[aria-invalid="true"]')?.focus();
}

registrationForm.querySelectorAll('input, select, textarea').forEach((field) => {
  field.addEventListener('input', () => {
    field.removeAttribute('aria-invalid');
    const error = field.closest('.field')?.querySelector('.field-error');
    if (error) error.textContent = '';
  });
});

registrationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();
  formStatus.textContent = '';
  if (!registrationForm.reportValidity()) return;

  const values = Object.fromEntries(new FormData(registrationForm).entries());
  submitButton.disabled = true;
  submitButton.innerHTML = 'Sending…';
  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.errors) showErrors(result.errors);
      throw new Error(result.message || 'Please check the highlighted details and try again.');
    }
    formStatus.textContent = result.message;
    formStatus.classList.add('is-success');
    registrationForm.reset();
    submitButton.classList.add('is-sent');
    submitButton.innerHTML = 'Sent <span aria-hidden="true">✓</span>';
    window.setTimeout(() => formDialog.close(), 2600);
  } catch (error) {
    formStatus.textContent = error.message || 'We could not send your details. Please try again.';
    formStatus.classList.remove('is-success');
  } finally {
    if (!submitButton.classList.contains('is-sent')) {
      submitButton.disabled = false;
      submitButton.innerHTML = 'Send to the secretariat <span aria-hidden="true">↗</span>';
    }
  }
});

const agendaTabs = [...document.querySelectorAll('.agenda-tab')];
const agendaItems = [...document.querySelectorAll('.agenda-item')];

function filterAgenda(filter) {
  agendaTabs.forEach((tab) => {
    const active = tab.dataset.filter === filter;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  agendaItems.forEach((item) => {
    item.hidden = filter !== 'all' && item.dataset.track !== filter;
  });
}

agendaTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => filterAgenda(tab.dataset.filter));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? agendaTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + agendaTabs.length) % agendaTabs.length;
    agendaTabs[nextIndex].focus();
    filterAgenda(agendaTabs[nextIndex].dataset.filter);
  });
});

document.querySelectorAll('[data-agenda-filter]').forEach((link) => {
  link.addEventListener('click', () => filterAgenda(link.dataset.agendaFilter));
});
