(function(){
  const modePills = document.getElementById('modePills');
  const jobpostSection = document.getElementById('jobpostSection');
  const jobguessSection = document.getElementById('jobguessSection');
  const profileSection = document.getElementById('profileSection');
  const jobpost = document.getElementById('jobpost');
  const company = document.getElementById('company');
  const guessProjects = document.getElementById('guessProjects');
  const projects = document.getElementById('projects');
  const outputMode = document.getElementById('outputMode');
  const jobLabel = document.getElementById('jobLabel');
  const runBtn = document.getElementById('runBtn');
  const resetBtn = document.getElementById('resetBtn');
  const loadStatus = document.getElementById('loadStatus');
  const resultArea = document.getElementById('resultArea');
  const errors = document.getElementById('errors');
  const outTitle = document.getElementById('outTitle');
  const outBody = document.getElementById('outBody');
  const githubUrl = document.getElementById('githubUrl');
  const blogUrl = document.getElementById('blogUrl');
  const docUrl = document.getElementById('docUrl');
  const saveProfileBtn = document.getElementById('saveProfileBtn');

  function setMode(mode){
    const isGuess = mode === 'jobguess';
    jobpostSection.style.display = isGuess ? 'none' : '';
    jobguessSection.style.display = isGuess ? '' : 'none';
    modePills.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p.dataset.mode === mode));
    if(isGuess){ company.focus(); }
  }

  function setProfileEnabled(enabled){
    profileSection.classList.toggle('none', !enabled);
    saveProfileBtn.disabled = !enabled;
  }

  modePills.addEventListener('click', e=>{
    const b = e.target.closest('.pill');
    if(b){ setMode(b.dataset.mode); }
  });

  resetBtn.addEventListener('click', ()=>{
    jobpost.value=''; company.value=''; guessProjects.value=''; projects.value='';
    outputMode.value='both'; jobLabel.value=''; setMode('jobpost');
    githubUrl.value=''; blogUrl.value=''; docUrl.value='';
    resultArea.classList.remove('show'); errors.innerHTML=''; outBody.innerHTML=''; outTitle.textContent='';
    loadStatus.textContent='';
  });

  saveProfileBtn.addEventListener('click', ()=>{
    const profile = {
      githubUrl: githubUrl.value.trim(),
      blogUrl: blogUrl.value.trim(),
      docUrl: docUrl.value.trim()
    };
    if(!profile.githubUrl && !profile.blogUrl && !profile.docUrl){
      errors.innerHTML = '<div class="err">저장할 연결 계정이 없습니다. 하나 이상 입력해 주세요.</div>';
      return;
    }
    try{
      fetch('/api/save-profile', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(profile)
      }).then(r=>r.json()).then(d=>{
        if(d && d.ok){
          loadStatus.textContent = '연결 계정이 저장됐습니다.';
          setTimeout(()=>{ loadStatus.textContent=''; }, 2500);
        } else {
          errors.innerHTML = '<div class="err">연결 계정 저장 중 오류가 발생했습니다.</div>';
        }
      }).catch(()=>{
        errors.innerHTML = '<div class="err">연결 계정 저장 중 오류가 발생했습니다.</div>';
      });
    }catch(e){
      errors.innerHTML = '<div class="err">연결 계정 저장 중 오류가 발생했습니다.</div>';
    }
  });

  runBtn.addEventListener('click', async ()=>{
    errors.innerHTML=''; outBody.innerHTML=''; outTitle.textContent=''; resultArea.classList.remove('show');
    loadStatus.textContent='분석 중…';
    const mode = modePills.querySelector('.pill.active').dataset.mode;
    const payload = {};
    if(mode === 'jobpost'){
      payload.jobpost = jobpost.value.trim();
    } else {
      payload.company = company.value.trim();
      payload.projects = guessProjects.value.trim();
    }
    payload.projects = (payload.projects || projects.value.trim());
    payload.outputMode = outputMode.value;
    payload.jobLabel = jobLabel.value.trim();

    if(!payload.jobpost && !payload.company){
      errors.innerHTML = '<div class="err">채용공고(URL 또는 텍스트) 또는 회사·관사를 입력해 주세요.</div>';
      loadStatus.textContent='';
      return;
    }
    if(!payload.projects){
      errors.innerHTML = '<div class="err">내 프로젝트 정보(GitHub·노션·구글문서 링크 또는 프로젝트 설명 텍스트)를 입력해 주세요.</div>';
      loadStatus.textContent='';
      return;
    }
    try{
      const res = await fetch('/api/analyze', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if(!res.ok){
        throw new Error(data.error || ('서버 오류: ' + res.status));
      }
      render(data);
      resultArea.classList.add('show');
      loadStatus.textContent='';
    }catch(err){
      errors.innerHTML = '<div class="err">분석 중 오류가 발생했습니다. ' + escapeHtml(String(err.message)) + '</div>';
      loadStatus.textContent='';
    }
  });

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function render(data){
    const mode = modePills.querySelector('.pill.active').dataset.mode;
    outTitle.innerHTML = '<h3>' + escapeHtml(data.title || '분석 결과') + '</h3>' +
      (data.summary ? '<div class="small">' + escapeHtml(data.summary) + '</div>' : '');
    let html = '';
    if(data.jobGuess && data.jobGuess.length){
      html += '<div class="section"><h3>🎯 지원 가능한 직무 후보 (회사·맥락 기준)</h3>' +
        '<div class="hint">직무가 이미 정해져 있으면 이 단계는 생략됩니다. 아래는 입력한 회사·관심사와 프로젝트 정보를 바탕으로 한 후보입니다.</div><ul>';
      data.jobGuess.forEach(g => {
        html += '<li><strong>' + escapeHtml(g.role) + '</strong> — ' + escapeHtml(g.reason) + '</li>';
      });
      html += '</ul></div>';
    }
    if(data.jobpostSummary){
      html += '<div class="section"><h3>📋 공고 요약</h3><div>' + escapeHtml(data.jobpostSummary) + '</div></div>';
    }
    if(data.checklist && data.checklist.length){
      html += '<div class="section"><h3>✅ 자격요건 대비 체크 (근거 포함)</h3><table><thead><tr><th style="width:34%">요건</th><th style="width:14%">상태</th><th>근거</th></tr></thead><tbody>';
      data.checklist.forEach(r => {
        const tagClass = r.status === '충족' ? 'ok' : (r.status === '부분충족' ? '' : 'bad');
        const tag = r.status === '충족' ? '충족' : (r.status === '부분충족' ? '부분충족' : '부족');
        html += '<tr><td>' + escapeHtml(r.req) + '</td><td><span class="tag ' + tagClass + '">' + tag + '</span></td><td>' + escapeHtml(r.basis || '') + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    if(data.projects && data.projects.length){
      html += '<div class="section"><h3>🎯 추천 프로젝트 (상위 2~3개)</h3><ol>';
      data.projects.forEach(p => {
        const medal = p.award ? ' 🏆' : '';
        html += '<li><strong>' + escapeHtml(p.name) + medal + '</strong><ul><li>추천 이유: ' + escapeHtml(p.reason || '') + '</li>' +
          (p.award ? '<li>수상/인정: ' + escapeHtml(p.award) + '</li>' : '') +
          '</ul></li>';
      });
      html += '</ol></div>';
    }
    if(data.gaps && data.gaps.length){
      html += '<div class="section"><h3>🔧 부족한 부분 보완 제안</h3><ul>';
      data.gaps.forEach(g => {
        html += '<li><strong>' + escapeHtml(g.req) + '</strong> — ' + escapeHtml(g.suggestion || '') + '</li>';
      });
      html += '</ul></div>';
    }
    if(data.phrases){
      const resumeHtml = data.phrases.resume ? '<div class="section"><h3>✍️ 이력서용 문구 초안</h3>' +
        '<div class="hint">팩트·역할·기술·성과 위주. 제출 전 다듬어 주세요.</div>' +
        '<ul>' + data.projects.map(p => '<li><strong>' + escapeHtml(p.name) + '</strong><ul><li>' +
          (data.phrases.resume[p.name] ? data.phrases.resume[p.name].map(s => '<div>' + escapeHtml(s) + '</div>').join('') : '') + '</li></ul></li>').join('') + '</ul></div>' : '';
      const coverHtml = data.phrases.cover ? '<div class="section"><h3>✍️ 자기소개서용 문구 초안(AI 초안)</h3>' +
        '<div class="hint">사실 정보 기반으로 생성된 초안입니다. 제출 전 반드시 사실·수치·역할·수상 여부를 확인하세요. 이 문장은 AI가 다듬은 초안이며, 그대로 제출하는 완성문이 아닙니다.</div>' +
        '<ul>' + data.projects.map(p => '<li><strong>' + escapeHtml(p.name) + '</strong><ul><li>' +
          (data.phrases.cover[p.name] ? data.phrases.cover[p.name].map(s => '<div>' + escapeHtml(s) + '</div>').join('') : '') + '</li></ul></li>').join('') + '</ul></div>' : '';
      html += resumeHtml + coverHtml;
    }
    if(data.compare && data.compare.length){
      html += '<div class="section"><h3>📊 공고 비교</h3><table><thead><tr><th>공고</th><th>적합도 요약</th><th>추천 우선순위</th></tr></thead><tbody>';
      data.compare.forEach(c => {
        html += '<tr><td>' + escapeHtml(c.posting) + '</td><td>' + escapeHtml(c.summary) + '</td><td>' + escapeHtml(c.priority) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    outBody.innerHTML = html;
  }
})();
