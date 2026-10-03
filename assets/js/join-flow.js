/* Progressive recruitment story. Answers stay in this document until an email is opened. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const intro = byId('joinIntro'), flow = byId('joinFlow'), form = byId('joinForm');
  if (!intro || !flow || !form) return;
  const panels = [...document.querySelectorAll('[data-join-step]')];
  const continueButton = byId('joinContinue');
  const nextButton = byId('joinNext');
  const backButton = byId('joinBack');
  const error = byId('joinError');
  const language = () => window.EILanguage?.current || 'en';
  const t = (key, vars = {}) => {
    const id = 'join.' + key;
    const fallback = window.EITranslations?.[id]?.[language()] || window.EITranslations?.[id]?.en || id;
    const text = window.EILanguage?.t(id, vars, fallback) ?? fallback;
    return text.replace(/\{(\w+)\}/g, (match, name) => vars[name] ?? match);
  };
  const recipient = 'hong.wang@hubu.edu.cn';
  let current = 0, introState = 'sphere', busy = false, draft = null;
  let morphTimer = 0;
  let errorKey = '', statusKey = '';
  const engine = () => window.EIJoinParticles;
  const field = name => form.querySelector(`[name="${name}"]`);
  const value = name => (field(name)?.value || '').trim();
  const oneLine = text => String(text).replace(/[\r\n]+/g, ' ').trim();

  function clearError() {
    errorKey = '';
    error.hidden = true;
    error.textContent = '';
    byId('interestFieldset').removeAttribute('aria-invalid');
  }
  function showError(key, control) {
    errorKey = key;
    error.textContent = t(key);
    error.hidden = false;
    if (control) {
      control.scrollIntoView?.({block:'center', behavior:'instant'});
      control.focus({preventScroll:false});
      control.reportValidity?.();
    }
    return false;
  }
  function validate(index) {
    clearError();
    if (index < 4 || index > 6) return true;
    const panel = panels[index];
    for (const input of panel.querySelectorAll('input,textarea,select')) {
      input.setCustomValidity('');
      if (input.required && !['radio','checkbox'].includes(input.type) && !input.value.trim()) input.setCustomValidity(t('validation.required'));
      if (!input.checkValidity()) {
        if (!input.validity?.customError) input.setCustomValidity(t('validation.fields'));
        return showError('validation.fields', input);
      }
    }
    if (index === 5 && !form.querySelector('[name="interests"]:checked') && !value('otherInterest')) {
      byId('interestFieldset').setAttribute('aria-invalid', 'true');
      return showError('validation.interests', field('interests'));
    }
    return true;
  }
  function collect() {
    const interests = [...form.querySelectorAll('[name="interests"]:checked')].map(input => t('interest.' + input.value));
    if (value('otherInterest')) interests.push(t('mail.other', {value:value('otherInterest')}));
    return {
      name:oneLine(value('applicantName')),
      identity:t('identity.' + (form.querySelector('[name="identity"]:checked')?.value || 'other')),
      email:oneLine(value('email')),
      school:oneLine(value('school')),
      major:oneLine(value('major')),
      year:oneLine(value('year')),
      interests,
      motivation:value('motivation'),
      experience:value('experience'),
      availability:oneLine(value('availability')),
      portfolio:oneLine(value('portfolio'))
    };
  }
  function makeDraft() {
    const answer = collect();
    const subject = t('mail.subject', answer);
    const body = [
      t('mail.greeting'), '', t('mail.intro'), '', t('mail.section1'),
      t('mail.name',{value:answer.name}), t('mail.identity',{value:answer.identity}),
      t('mail.school',{value:answer.school}), t('mail.major',{value:answer.major}),
      t('mail.year',{value:answer.year || t('mail.missing')}), t('mail.email',{value:answer.email}), '',
      t('mail.section2'), ...answer.interests.map(item => '• ' + item), '',
      t('mail.section3'), answer.motivation, '',
      t('mail.section4'), answer.experience || t('mail.missing'), '',
      t('mail.section5'), answer.availability, '',
      t('mail.section6'), answer.portfolio || t('mail.missing'), '',
      t('mail.attachments'), '• ' + t('mail.cv'), '• ' + t('mail.transcript'), '',
      t('mail.thanks'), answer.name
    ].join('\n').replace(/\r?\n/g, '\r\n');
    draft = {subject, body};
    // Values are encoded as data. Applicant text never becomes HTML or mail headers.
    byId('emailPreview').textContent = body;
    byId('sendEmail').href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setStatus('');
    return draft;
  }
  function showStep(index) {
    current = Math.max(0, Math.min(panels.length - 1, index));
    document.body.classList.add('join-reading');
    intro.hidden = true;
    intro.inert = true;
    engine()?.setActive(false);
    flow.hidden = false;
    flow.inert = false;
    panels.forEach((panel, i) => {panel.hidden = i !== current; panel.inert = i !== current;});
    updateProgress();
    byId('joinProgress').setAttribute('aria-valuenow', String(current + 1));
    byId('joinProgress').style.setProperty('--join-progress', String((current + 1) / 8));
    nextButton.hidden = current === 7;
    byId('joinFinalHint').hidden = current !== 7;
    clearError();
    if (current === 7) makeDraft();
    window.scrollTo({top:0, behavior:'instant'});
    panels[current].querySelector('h2').focus({preventScroll:true});
  }
  function showInvitation() {
    document.body.classList.remove('join-reading');
    flow.hidden = true;
    flow.inert = true;
    intro.hidden = false;
    intro.inert = false;
    engine()?.setActive(true);
    window.scrollTo({top:0, behavior:'instant'});
    continueButton.focus({preventScroll:true});
  }
  async function begin() {
    if (busy) return;
    if (introState === 'question') {showStep(0); return;}
    busy = true;
    continueButton.disabled = true;
    intro.dataset.phase = 'morphing';
    byId('joinParticleHint').textContent = t('hint.morph');
    try {
      const fallback = new Promise(resolve => {morphTimer = setTimeout(resolve, 2600);});
      await Promise.race([Promise.resolve(engine()?.morph()), fallback]);
    } catch (_) {
      // Keep an ordinary readable invitation if the graphics context fails.
      intro.classList.remove('particles-ready');
    } finally {
      clearTimeout(morphTimer);
      introState = 'question';
      intro.dataset.phase = 'question';
      intro.classList.add('is-question');
      continueButton.disabled = false;
      busy = false;
      byId('joinParticleHint').textContent = t('hint.question');
    }
  }
  function next() {
    if (!flow.hidden && current < 7 && validate(current)) showStep(current + 1);
  }
  continueButton.addEventListener('click', begin);
  nextButton.addEventListener('click', next);
  backButton.addEventListener('click', () => {if (current === 0) showInvitation(); else showStep(current - 1);});
  byId('joinEdit').addEventListener('click', () => showStep(4));
  form.addEventListener('submit', event => {event.preventDefault(); next();});
  form.addEventListener('input', event => {event.target.setCustomValidity?.(''); clearError();});
  form.addEventListener('change', clearError);
  byId('sendEmail').addEventListener('click', () => {
    // A mailto opens a draft; it never sends a message or attaches files itself.
    makeDraft();
    setStatus('status.open');
  });
  byId('copyEmail').addEventListener('click', async () => {
    const email = makeDraft();
    const text = `${t('mail.to',{value:recipient})}\r\n${t('mail.subjectLabel',{value:email.subject})}\r\n\r\n${email.body}`;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {await navigator.clipboard.writeText(text); copied = true;}
    } catch (_) { /* The selection fallback also works for local file previews. */ }
    if (!copied) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0';
      document.body.append(area);
      area.focus(); area.select();
      try {copied = document.execCommand('copy');} catch (_) {copied = false;}
      area.remove();
      byId('copyEmail').focus({preventScroll:true});
    }
    setStatus(copied ? 'status.copied' : 'status.copyFailed');
  });
  function base64(text) {
    const bytes = new TextEncoder().encode(text);
    return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
  }
  function encodedSubject(text) {
    const words = [];
    let chunk = '', size = 0;
    for (const character of text) {
      const bytes = new TextEncoder().encode(character).length;
      if (size + bytes > 42) {words.push(`=?UTF-8?B?${base64(chunk)}?=`); chunk = ''; size = 0;}
      chunk += character;
      size += bytes;
    }
    if (chunk) words.push(`=?UTF-8?B?${base64(chunk)}?=`);
    return words.join('\r\n ');
  }
  byId('downloadEmail').addEventListener('click', () => {
    const email = makeDraft();
    const mime = [
      `To: ${recipient}`, `Subject: ${encodedSubject(email.subject)}`,
      'X-Unsent: 1', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64', '', base64(email.body).match(/.{1,76}/g).join('\r\n'), ''
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([mime], {type:'message/rfc822'}));
    const link = document.createElement('a');
    link.href = url; link.download = 'EI-Lab-application.eml';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('status.downloaded');
  });
  function setStatus(key) {
    statusKey = key;
    byId('emailStatus').textContent = key ? t(key) : '';
  }
  function updateProgress() {
    const title = t('step.' + current);
    const description = t('progress',{step:current+1,title});
    byId('joinRoute').textContent = `${String(current + 1).padStart(2, '0')} / 08 · ${title}`;
    byId('joinProgress').setAttribute('aria-valuetext', description);
    byId('joinStepStatus').textContent = description;
  }
  window.addEventListener('site-language-change', () => {
    updateProgress();
    if (errorKey) error.textContent = t(errorKey);
    form.querySelectorAll('input,textarea,select').forEach(input => {
      if (input.validity?.customError) input.setCustomValidity(t('validation.fields'));
    });
    if (!flow.hidden && current === 7) {
      const status = statusKey;
      makeDraft();
      setStatus(status);
    }
    byId('joinParticleHint').textContent = t(busy ? 'hint.morph' : introState === 'question' ? 'hint.question' : window.matchMedia?.('(pointer: coarse)').matches ? 'hint.sphere.coarse' : 'hint.sphere');
  });
  updateProgress();
  continueButton.disabled = false;
})();
