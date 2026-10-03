/* A rotating, accessible people directory. SVG remains crisp at every viewport. */
(() => {
  'use strict';
  const dataNode = document.getElementById('labTeamData');
  const svg = document.getElementById('teamDonut');
  if (!dataNode || !svg) return;
  let groups;
  try { groups = JSON.parse(dataNode.textContent); } catch (_) { return; }
  const byId = id => document.getElementById(id);
  const rotor = byId('teamRotor'), defs = byId('teamDefs');
  const select = byId('memberSelect');
  const tabs = [...document.querySelectorAll('[data-group]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const NS = 'http://www.w3.org/2000/svg';
  const BASE = 'https://raw.githubusercontent.com/No1dry/wanghong.github.io/main/';
  const center = 265, radius = 171, outer = 218, inner = 117;
  let groupKey = 'faculty', members = [], selected = -1, step = 90;
  let angle = 0, target = 0, velocity = 0, frame = 0, lastFrame = 0;
  let mode = 'idle', gesture = null, nodes = [], stopped = false;
  const remembered = {};
  const t = (key, vars = {}, fallback = '') => {
    if (window.EILanguage) return window.EILanguage.t(key, vars, fallback);
    const text = window.EITranslations?.[key]?.en || fallback;
    return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
  };
  const labelForGroup = () => t(`lab.group.${groupKey}`, {}, groups[groupKey].label);
  function memberName(member) {
    const native = member.name.match(/^(.*?)\s*[（(]([^()（）]+)[)）]\s*$/);
    if (window.EILanguage?.current === 'zh' && native) return native[2];
    return native ? native[1].trim() : member.name;
  }
  const translatedRoles = value => value ? value.split(' · ').map(role => t(`lab.role.${role}`, {}, role)).join(' · ') : '';
  const announcement = index => t('lab.announcement', {name:memberName(members[index]), group:labelForGroup(), index:index + 1, count:members.length}, `${memberName(members[index])}, ${labelForGroup()}, ${index + 1} of ${members.length}`);

  function svgNode(tag, attrs = {}) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }
  function point(r, degrees) {
    const rad = degrees * Math.PI / 180;
    return [center + Math.cos(rad) * r, center + Math.sin(rad) * r];
  }
  function sectorPath(start, end) {
    const a = point(outer, start), b = point(outer, end);
    const c = point(inner, end), d = point(inner, start);
    const large = end - start > 180 ? 1 : 0;
    return `M${a} A${outer},${outer} 0 ${large} 1 ${b} L${c} A${inner},${inner} 0 ${large} 0 ${d} Z`;
  }
  const wrap = value => ((value % members.length) + members.length) % members.length;
  const signed = value => ((value + 180) % 360 + 360) % 360 - 180;
  const nearest = () => wrap(Math.round(-angle / step));
  const pad = value => String(value).padStart(2, '0');
  // The one missing local faculty portrait still uses its original repository asset.
  const photoURL = photo => photo === 'images/huangxu.png' ? BASE + photo : photo;

  function setName(name) {
    const heading = byId('memberName');
    heading.textContent = name;
  }
  function updateDetail(index, announce = false, force = false) {
    if (index === selected && !force) {
      if (announce) byId('teamStatus').textContent = announcement(index);
      return;
    }
    selected = index;
    remembered[groupKey] = index;
    const member = members[index];
    nodes.forEach((node, i) => {
      node.segment.classList.toggle('is-active', i === index);
      node.segment.setAttribute('aria-pressed', String(i === index));
      node.segment.setAttribute('tabindex', i === index ? '0' : '-1');
    });
    setName(memberName(member));
    byId('memberRole').textContent = labelForGroup();
    byId('memberPosition').textContent = `${pad(index + 1)} / ${pad(members.length)}`;
    byId('memberAffiliation').textContent = translatedRoles(member.affiliation);
    byId('memberAffiliation').hidden = !member.affiliation;
    byId('memberInitials').textContent = member.short;
    const photo = byId('memberPhoto');
    photo.hidden = !member.photo;
    photo.alt = window.EILanguage?.current === 'zh' ? memberName(member) : member.alt || memberName(member);
    photo.onerror = () => { photo.hidden = true; };
    if (member.photo) photo.src = photoURL(member.photo); else photo.removeAttribute('src');
    byId('memberResearch').hidden = !member.interests;
    byId('memberInterests').textContent = translatedRoles(member.interests);
    byId('memberLinksSection').hidden = !member.links.length;
    byId('memberLinks').replaceChildren();
    member.links.forEach(link => {
      const a = document.createElement('a');
      a.href = link.href;
      a.textContent = t(`lab.link.${link.label}`, {}, link.label) + ' ↗';
      if (/^https?:/.test(link.href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      byId('memberLinks').append(a);
    });
    byId('memberPublicationsSection').hidden = !member.publications.length;
    byId('memberPublications').replaceChildren();
    member.publications.forEach(paper => {
      const li = document.createElement('li');
      li.textContent = paper.title;
      byId('memberPublications').append(li);
    });
    select.value = String(index);
    if (announce) byId('teamStatus').textContent = announcement(index);
  }
  function paint() {
    rotor.setAttribute('transform', `rotate(${angle.toFixed(4)} ${center} ${center})`);
    nodes.forEach(node => node.label.setAttribute('transform', `translate(${node.x} ${node.y}) rotate(${-angle})`));
    updateDetail(nearest());
  }
  function stopFrame() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
  }
  function settle() {
    angle = target;
    angle = signed(angle);
    target = angle;
    velocity = 0;
    mode = 'idle';
    paint();
    updateDetail(selected, true);
  }
  function animate(now) {
    frame = 0;
    const dt = lastFrame ? Math.min(2.5, Math.max(.25, (now - lastFrame) / 16.667)) : 1;
    lastFrame = now;
    if (mode === 'fling') {
      angle += velocity * dt;
      velocity *= Math.pow(.9, dt);
      if (Math.abs(velocity) < .12) { mode = 'snap'; target = Math.round(angle / step) * step; }
    }
    if (mode === 'snap') {
      angle += (target - angle) * (1 - Math.pow(.81, dt));
      if (Math.abs(target - angle) < .035) { settle(); return; }
    }
    paint();
    if (mode !== 'idle' && !stopped && !document.hidden) frame = requestAnimationFrame(animate);
  }
  function wake() {
    if (!frame && !stopped && !document.hidden) { lastFrame = 0; frame = requestAnimationFrame(animate); }
  }
  function goTo(index, focus = false) {
    if (!members.length) return;
    index = wrap(index);
    stopFrame();
    velocity = 0;
    target = angle + signed(-index * step - angle);
    mode = 'snap';
    if (reduced.matches) settle(); else wake();
    // Keyboard focus follows the intended member even during the short rotation.
    if (focus) nodes[index].segment.focus({preventScroll:true});
  }
  function goBy(direction, focus = false) {
    const base = mode === 'snap' ? wrap(Math.round(-target / step)) : nearest();
    goTo(base + direction, focus);
  }
  function cancelGesture() {
    if (!gesture) return;
    const id = gesture.id;
    gesture = null;
    svg.classList.remove('is-dragging');
    if (svg.hasPointerCapture?.(id)) svg.releasePointerCapture(id);
  }
  function setGroup(key) {
    if (!groups[key]) return;
    cancelGesture();
    stopFrame();
    groupKey = key;
    members = groups[key].members;
    step = 360 / members.length;
    selected = -1;
    mode = 'idle';
    angle = -(remembered[key] || 0) * step;
    target = angle;
    velocity = 0;
    nodes = [];
    rotor.replaceChildren();
    defs.replaceChildren();
    select.replaceChildren();
    tabs.forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.group === key)));
    byId('teamGroupName').textContent = labelForGroup();
    byId('teamCount').textContent = t('lab.teammates', {count:pad(members.length)}, `${pad(members.length)} TEAMMATES`);
    members.forEach((member, i) => {
      const segment = svgNode('g', {class:'disc-segment', 'data-member':i, role:'button', tabindex:'-1', 'aria-label':memberName(member), 'aria-pressed':'false'});
      segment.append(svgNode('path', {class:'sector', d:sectorPath(i * step - step / 2 + .65, i * step + step / 2 - .65)}));
      const [x, y] = point(radius, i * step);
      const label = svgNode('g', {'aria-hidden':'true'});
      label.append(svgNode('circle', {class:'disc-avatar', r:26, cx:0, cy:-5}));
      const initials = svgNode('text', {class:'disc-initials', x:0, y:0, 'text-anchor':'middle'});
      initials.textContent = member.short;
      label.append(initials);
      if (member.photo) {
        const clipId = `team-portrait-${key}-${i}`;
        const clip = svgNode('clipPath', {id:clipId});
        clip.append(svgNode('circle', {cx:0, cy:-5, r:25}));
        defs.append(clip);
        const img = svgNode('image', {class:'disc-photo', href:photoURL(member.photo), x:-25, y:-30, width:50, height:50, preserveAspectRatio:'xMidYMid slice', 'clip-path':`url(#${clipId})`});
        img.addEventListener('error', () => img.remove(), {once:true});
        label.append(img);
      }
      const caption = svgNode('text', {class:'disc-label', x:0, y:36, 'text-anchor':'middle'});
      caption.textContent = member.short;
      label.append(caption);
      segment.append(label);
      rotor.append(segment);
      nodes.push({segment, label, x, y});
      const option = document.createElement('option');
      option.value = String(i);
      option.textContent = memberName(member);
      select.append(option);
    });
    paint();
    updateDetail(selected, true);
  }

  // Ticks are stationary. Only the segmented ring turns; portraits counter-rotate.
  for (let i = 0; i < 60; i++) {
    const a = point(i % 5 ? 232 : 229, i * 6), b = point(235, i * 6);
    byId('teamTicks').append(svgNode('line', {class:'disc-tick', x1:a[0], y1:a[1], x2:b[0], y2:b[1]}));
  }
  tabs.forEach(tab => tab.addEventListener('click', () => setGroup(tab.dataset.group)));
  byId('teamPrev').addEventListener('click', () => goBy(-1));
  byId('teamNext').addEventListener('click', () => goBy(1));
  select.addEventListener('change', () => goTo(Number(select.value)));
  svg.addEventListener('keydown', event => {
    let action;
    if (['ArrowRight', 'ArrowDown'].includes(event.key)) action = () => goBy(1, true);
    if (['ArrowLeft', 'ArrowUp'].includes(event.key)) action = () => goBy(-1, true);
    if (event.key === 'Home') action = () => goTo(0, true);
    if (event.key === 'End') action = () => goTo(members.length - 1, true);
    if (event.key === 'Enter' || event.key === ' ') {
      const item = event.target.closest('[data-member]');
      if (item) action = () => goTo(Number(item.dataset.member));
    }
    if (action) { event.preventDefault(); action(); }
  });
  svg.addEventListener('click', event => {
    // Assistive technology may activate a button without pointer events.
    if (event.detail !== 0) return;
    const item = event.target.closest('[data-member]');
    if (item) goTo(Number(item.dataset.member));
  });
  svg.addEventListener('pointerdown', event => {
    if (event.isPrimary === false || (event.button !== undefined && event.button !== 0) || gesture) return;
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const item = event.target.closest('[data-member]');
    stopFrame();
    mode = 'idle';
    velocity = 0;
    gesture = {id:event.pointerId, touch:event.pointerType === 'touch', x:event.clientX, y:event.clientY,
      lastX:event.clientX, cx, cy, lastAngle:Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI,
      lastTime:performance.now(), moved:false, accepted:event.pointerType !== 'touch', member:item ? Number(item.dataset.member) : null,
      linear:Math.hypot(event.clientX - cx, event.clientY - cy) < rect.width * .13};
    if (gesture.accepted) { svg.setPointerCapture(event.pointerId); svg.classList.add('is-dragging'); }
  });
  svg.addEventListener('pointermove', event => {
    const g = gesture;
    if (!g || g.id !== event.pointerId) return;
    const dx = event.clientX - g.x, dy = event.clientY - g.y;
    if (!g.accepted) {
      if (Math.hypot(dx, dy) < 10) return;
      if (Math.abs(dy) > Math.abs(dx) * 1.15) { stabilize(); return; }
      g.accepted = true;
      svg.setPointerCapture(event.pointerId);
      svg.classList.add('is-dragging');
    }
    if (Math.hypot(dx, dy) > (g.touch ? 10 : 5)) g.moved = true;
    if (!g.moved) return;
    if (event.cancelable) event.preventDefault();
    const now = performance.now();
    const current = Math.atan2(event.clientY - g.cy, event.clientX - g.cx) * 180 / Math.PI;
    const delta = g.linear ? (event.clientX - g.lastX) * .45 : signed(current - g.lastAngle);
    angle += delta;
    const nextVelocity = delta / Math.max(8, now - g.lastTime) * 16.667;
    velocity = Math.max(-8, Math.min(8, velocity * .25 + nextVelocity * .75));
    g.lastAngle = current;
    g.lastX = event.clientX;
    g.lastTime = now;
    paint();
  }, {passive:false});
  function finishPointer(event, cancelled = false) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const g = gesture;
    cancelGesture();
    if (!cancelled && !g.moved && g.member !== null) { goTo(g.member); return; }
    if (cancelled || performance.now() - g.lastTime > 100 || reduced.matches) velocity = 0;
    if (!reduced.matches && Math.abs(velocity) >= .12) mode = 'fling';
    else { mode = 'snap'; target = Math.round(angle / step) * step; }
    if (reduced.matches) settle(); else wake();
  }
  svg.addEventListener('pointerup', event => finishPointer(event));
  svg.addEventListener('pointercancel', event => finishPointer(event, true));
  svg.addEventListener('lostpointercapture', event => finishPointer(event, true));
  function stabilize() {
    cancelGesture();
    stopFrame();
    target = Math.round(angle / step) * step;
    settle();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stabilize(); });
  window.addEventListener('resize', stabilize, {passive:true});
  reduced.addEventListener?.('change', stabilize);
  window.addEventListener('pagehide', () => { stopped = true; stabilize(); });
  window.addEventListener('pageshow', () => { stopped = false; });
  window.addEventListener('site-language-change', () => {
    // Update labels in place: preserve the active group, selection, angle and momentum.
    byId('teamGroupName').textContent = labelForGroup();
    byId('teamCount').textContent = t('lab.teammates', {count:pad(members.length)}, `${pad(members.length)} TEAMMATES`);
    nodes.forEach((node, index) => {
      const name = memberName(members[index]);
      node.segment.setAttribute('aria-label', name);
      select.options[index].textContent = name;
    });
    if (selected >= 0) updateDetail(selected, true, true);
  });
  setGroup('faculty');
})();
