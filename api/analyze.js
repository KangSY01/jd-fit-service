// /api/analyze
// 클라이언트가 보낸 입력을 바탕으로:
// 1) 공고(URL 또는 텍스트) 파악
// 2) 내 프로젝트 정보(GitHub 링크/텍스트 등) 확보
// 3) 직무 추천(필요 시), 자격요건 체크리스트, 추천 프로젝트, 보완 제안, 문구 초안, 공고 비교
//
// 규칙:
// - 외부 호출은 GitHub 공개 API와 공고 URL 본문 추출(실패 시 텍스트 fallback)만 수행
// - 응답 JSON에 키·토큰 값이 섞이지 않도록 함
// - 스킬 코드가 아니라, 스킬의 의도를 서버리스 함수로 구현한 것임

function stripHtml(s){
  if(!s) return '';
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function fetchText(url, ua){
  const proto = url.startsWith('https:') ? 'https' : 'http';
  const mod = require(proto);
  return new Promise((resolve, reject)=>{
    try {
      const req = mod.get(url, { headers: { 'User-Agent': ua || 'jd-fit-mvp/1.0' } }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          if(res.statusCode !== 200){ return reject(new Error('HTTP ' + res.statusCode)); }
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
      });
      req.on('error', reject);
    } catch(e){
      reject(e);
    }
  });
}

async function fetchFileContent(repoFull, path){
  const url = 'https://api.github.com/repos/' + encodeURIComponent(repoFull) + '/contents/' + encodeURIComponent(path);
  const raw = await fetchText(url, 'jd-fit-mvp/1.0');
  const parsed = JSON.parse(raw);
  if(parsed && parsed.content){
    const decoded = Buffer.from(parsed.content, 'base64').toString('utf8');
    return decoded;
  }
  return null;
}

function decideDepFile(language){
  if(!language) return null;
  const l = language.toLowerCase();
  if(l === 'python') return 'requirements.txt';
  if(l === 'javascript' || l === 'typescript') return 'package.json';
  if(l === 'java'){
    if(['pom.xml','build.gradle','build.gradle.kts'].includes('pom.xml')){
      return 'pom.xml';
    }
    return 'build.gradle';
  }
  return null;
}

async function fetchHtml(url, ua){
  try {
    const body = await fetchText(url, ua);
    return { ok: true, html: body, status: 200 };
  } catch(e){
    return { ok: false, error: e && e.message ? String(e.message) : String(e), status: null };
  }
}

function extractRepoNamesFromText(text){
  const re = /github\.com[:/]([^/]+)\/([A-Za-z0-9_.-]+)/g;
  const out = [];
  let m;
  while((m = re.exec(text))){
    out.push(m[0]);
  }
  return out;
}

async function resolveGitHubLinks(links){
  const seen = new Set();
  const out = [];
  for(const raw of links){
    const s = (raw || '').trim();
    let match = s.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i);
    if(!match){
      match = s.match(/github\.com\/([A-Za-z0-9_.-]+)\/?(?:\?|$)/i);
    }
    if(match){
      const user = match[1].toLowerCase();
      const repo = (match[2] || '').toLowerCase();
      if(repo){
        const key = user + '/' + repo;
        if(!seen.has(key)){
          seen.add(key);
          out.push('https://github.com/' + match[1] + '/' + match[2]);
        }
      } else if(!repo){
        if(!seen.has(user + '::profile')){
          seen.add(user + '::profile');
          out.push({ profile: 'https://github.com/' + match[1] });
        }
      }
    } else {
      if(s){
        out.push({ raw: s });
      }
    }
  }
  return out;
}

async function fetchGitHubRepos(user, token){
  const headers = { 'User-Agent': 'jd-fit-mvp/1.0' };
  if(token) headers['Authorization'] = 'token ' + token;
  const url = 'https://api.github.com/users/' + user + '/repos?per_page=100&sort=updated';
  try {
    const body = await fetchText(url, 'jd-fit-mvp/1.0');
    return JSON.parse(body);
  } catch(e){
    return null;
  }
}

function summarizeRepo(repo, readme, depFile, depFileName, language){
  const name = (repo.full_name || repo.name || '');
  const desc = (repo.description || '').trim();
  const lang = language || repo.language || '';
  const readmeText = (readme || '').trim();
  const depText = (depFile || '').trim();
  const depFileLabel = depFileName || '';
  const combined = (desc + ' ' + readmeText + ' ' + depText + ' ' + (repo.topics || []).join(' ')).toLowerCase();
  return {
    name,
    description: desc,
    language: lang,
    readme: readmeText,
    depFile: depText,
    depFileName: depFileLabel,
    text: combined,
    url: repo.html_url || ('https://github.com/' + (repo.full_name || repo.name))
  };
}

function parseJobPost(text){
  const cleaned = stripHtml(text);
  const lines = cleaned.split(/\n/).filter(l => l.trim().length > 0);
  const first = lines.slice(0, 5).join(' ');
  const keywords = extractKeywords(cleaned);
  return {
    raw: cleaned,
    firstLines: first,
    keywordHints: keywords.slice(0, 14),
    length: cleaned.length
  };
}

function extractKeywords(text){
  const pool = [
    'nlp','llm','rag','agent','embedding','vector','search','qa','chatbot','모델','추론','gpu','pytorch',
    'transformer','파인튜닝','langchain','langgraph','vllm','tensorrt','knowledge graph','ontology','rerank',
    '음성인식','stt','asr','tts','음성합성','비전','vision','이미지','객체탐지','문서','document','데이터',
    '파이썬','python','django','fastapi','flask','react','typescript','javascript','next.js','리액트',
    '백엔드','프론트','프론트엔드','데이터','분석','배포','인프라','docker','kubernetes','aws'
  ];
  const lower = text.toLowerCase();
  return pool.filter(k => lower.includes(k));
}

function analyze(data){
  const mode = data.mode;
  const jobpostRaw = data.jobpost || '';
  const company = data.company || '';
  const projectsRaw = data.projects || '';
  const outputMode = data.outputMode || 'both';
  const jobLabel = data.jobLabel || '';

  let posting;
  if(jobpostRaw.startsWith('http://') || jobpostRaw.startsWith('https://')){
    const extracted = (data.extractedHtml && data.extractedHtml.ok) ? data.extractedHtml : null;
    if(extracted && extracted.ok){
      posting = parseJobPost(extracted.html);
      posting.sourceType = 'url';
      posting.sourceNote = 'URL에서 본문 추출';
    } else {
      posting = {
        raw: '(공고 URL 본문 추출에 실패했습니다. 공고 텍스트를 직접 붙여넣어 주세요.)',
        sourceType: 'url-failed',
        sourceNote: 'URL 본문 추출 실패 — 텍스트 재입력 필요'
      };
    }
  } else {
    posting = parseJobPost(jobpostRaw);
    posting.sourceType = 'text';
    posting.sourceNote = '붙여넣은 공고 텍스트';
  }

  const keywords = posting.keywordHints || [];

  const repoUrls = extractRepoNamesFromText(projectsRaw);
  const githubThings = resolveGitHubLinks(repoUrls.length ? repoUrls : [projectsRaw]);
  const profileCandidates = githubThings.filter(x => x && x.profile);
  const directRepoUrls = githubThings.filter(x => x && x.profile === undefined && x.raw === undefined);
  const otherLinks = githubThings.filter(x => x && x.raw !== undefined);

  const projectSummaries = [];

  for(const p of profileCandidates){
    const user = p.profile.match(/github\.com\/([A-Za-z0-9_.-]+)/i);
    if(!user) continue;
    const userKey = user[1];
    const repos = (data.githubRepos && data.githubRepos[userKey]) ? data.githubRepos[userKey] : null;
    if(repos && Array.isArray(repos)){
      for(const r of repos){
        const files = data.repoFilesMap && data.repoFilesMap[r.full_name || r.name];
        const s = summarizeRepo(r, files && files.readme, files && files.depFile, files && files.depFileName, files && files.language || r.language || '');
        projectSummaries.push(s);
      }
    }
  }

  for(const u of directRepoUrls){
    if(u.endsWith('.git')) continue;
    const repoSrc = u.replace('https://github.com/','');
    const files = data.repoFilesMap && data.repoFilesMap[repoSrc];
    const repoSrcData = (data.githubRepos && data.githubRepos[repoSrc]) ? data.githubRepos[repoSrc] : null;
    if(files){
      for(const r of repoSrcData || []){
        const s = summarizeRepo(r, files.readme, files.depFile, files.depFileName, files.language || r.language || '');
        projectSummaries.push(s);
      }
    } else if(repoSrcData && Array.isArray(repoSrcData) && repoSrcData.length){
      for(const r of repoSrcData){
        const s = summarizeRepo(r, '', '', '', r.language || '');
        projectSummaries.push(s);
      }
    }
  }

  const textProjectLines = (projectsRaw.split(/\n/).filter(l => l.trim().length > 0));
  textProjectLines.forEach(line => {
    if(!line.match(/github\.com/i)){
      projectSummaries.push({
        name: line.slice(0, 80),
        description: line,
        language: '',
        readme: line.slice(0, 1200),
        text: line.toLowerCase(),
        url: '',
        source: '텍스트 입력'
      });
    }
  });

  const jobGuess = [];
  if(mode === 'jobguess' && company){
    jobGuess.push({
      role: '백엔드 개발',
      reason: '입력한 프로젝트 정보에 서버/API/백엔드 관련 기술(백엔드, API, Django, 데이터베이스 등)이 보이면 후보. 실제 포함 여부는 프로젝트 내용 확인 필요.'
    });
    jobGuess.push({
      role: '프론트엔드 개발',
      reason: 'React/Next.js/TypeScript 등 프론트 기술이나 "웹/화면/UI" 계열 프로젝트가 보이면 후보.'
    });
    jobGuess.push({
      role: '데이터/AI 개발',
      reason: '키워드(NLP, LLM, RAG, 에이전트, 데이터 분석, 데이터 파이프라인 등)와 연결 가능한 프로젝트가 있으면 후보. 단, 지금 프로젝트 목록에 해당 실무 프로젝트가 실제로 있는지 확정은 필요함.'
    });
  }

  const checklist = [];
  if(posting.raw && posting.raw.indexOf('추출 실패') === -1){
    if(keywords.includes('python') || keywords.includes('파이썬')){
      checklist.push({ req: 'Python 활용 능력', status: '인정 가능(근거 확인 필요)', basis: '입력 프로젝트 목록에 Python 프로젝트가 있으면 후보. 실제 코드/역할 확인 필요.' });
    }
    if(keywords.includes('django') || keywords.includes('fastapi') || keywords.includes('flask') || keywords.includes('백엔드') || keywords.includes('api')){
      checklist.push({ req: '웹 백엔드/API 개발 경험', status: '부분충족 가능', basis: '백엔드/API/프레임워크 관련 프로젝트가 있으면 부분충족 가능. 역할·범위 확인 필요.' });
    }
    if(keywords.includes('nlp') || keywords.includes('llm') || keywords.includes('rag') || keywords.includes('agent') || keywords.includes('파인튜닝')){
      checklist.push({ req: 'NLP/LLM/RAG/에이전트 관련 개발 경험', status: '부족 가능성 높음', basis: '지금 프로젝트 목록에 해당 실무 프로젝트가 보이지 않으면 부족. 관련 프로젝트가 있으면 부분충족으로 조정.' });
    }
    if(keywords.includes('pytorch') || keywords.includes('모델') || keywords.includes('추론') || keywords.includes('gpu')){
      checklist.push({ req: '딥러닝 프레임워크/모델 학습·추론 경험', status: '부족 가능성 높음', basis: 'PyTorch/모델 학습·추론 관련 프로젝트가 없으면 부족.' });
    }
    if(keywords.includes('vector') || keywords.includes('search') || keywords.includes('embedding')){
      checklist.push({ req: 'Vector DB / 검색 / 임베딩 관련 경험', status: '부족 가능성 높음', basis: '관련 프로젝트가 없으면 부족.' });
    }
  } else {
    checklist.push({ req: '공고 자격요건(공고 본문 추출 실패)', status: '확인 불가', basis: '공고 URL 본문 추출에 실패했거나, 공고 텍스트가 입력되지 않았습니다. 공고 텍스트를 붙여넣으면 다시 판단할 수 있습니다.' });
  }

  const projects = [];
  const scored = projectSummaries.map(p => scoreProject(p, keywords)).filter(p => p && p.sourced);
  scored.sort((a,b)=> b.score - a.score);
  const top = scored.slice(0, 3);
  top.forEach(p => {
    projects.push({
      name: p.name,
      reason: p.reason || '공고 키워드와의 기술적 관련도 기준. 실제 역할은 프로젝트 내용 확인 필요.',
      award: p.award || null,
      url: p.url || ''
    });
  });

  const gaps = [];
  checklist.forEach(c => {
    if(c.status === '부족 가능성 높음' || c.status === '확인 불가' || c.status === '부족'){
      gaps.push({
        req: c.req,
        suggestion: c.basis.indexOf('부족') !== -1 && c.basis.indexOf('프로젝트') !== -1
          ? '기존 프로젝트로는 보완이 어려운 영역일 수 있음 — 별도 학습/경험 필요'
          : '기존 프로젝트 확장 또는 별도 학습 필요'
      });
    }
  });

  return {
    title: mode === 'jobguess' ? '직무 후보 추천 + 분석 결과' : '분석 결과',
    summary: (mode === 'jobguess' ? '지원 회사·관심사: ' + company : '') + ' | 공고 출처: ' + posting.sourceNote,
    jobGuess: jobGuess,
    jobpostSummary: posting.sourceNote + (posting.firstLines ? ' — ' + posting.firstLines.slice(0, 200) : ''),
    keywords,
    checklist,
    projects,
    gaps,
    outputMode
  };
}

function scoreProject(p, keywords){
  let score = 0;
  const lower = ((p.text || '') + ' ' + (p.depFile || '')).toLowerCase();
  if(p.url || p.source === 'GitHub API'){
    score += 3;
  }
  if(p.url || p.source === 'GitHub API'){
    if(keywords.some(k => lower.includes(k))){ score += 6; }
    if(keywords.includes('python') && (lower.includes('python') || p.language === 'Python')){ score += 3; }
    if(keywords.includes('django') && lower.includes('django')) score += 4;
    if(keywords.includes('rag') && lower.includes('rag')) score += 5;
    if(keywords.includes('llm') && lower.includes('llm')) score += 5;
    if(keywords.includes('agent') && lower.includes('agent')) score += 4;
    if(keywords.includes('embedding') && lower.includes('embedding')) score += 5;
    if(keywords.includes('vector') && lower.includes('vector')) score += 5;
    if(keywords.includes('search') && (lower.includes('search') || lower.includes('검색'))) score += 3;
    if(keywords.includes('api') && (lower.includes('api') || lower.includes('서버') || lower.includes('back'))) score += 3;
    if(keywords.includes('data') && (lower.includes('data') || lower.includes('데이터') || lower.includes('분석'))) score += 3;
    if(keywords.includes('nlp') && (lower.includes('nlp'))) score += 5;
    if(keywords.includes('모델') && (lower.includes('모델') || lower.includes('model'))) score += 3;
  }
  if(lower.includes('수상') || lower.includes('대상') || lower.includes('1등') || lower.includes('1st') || lower.includes('최우수') || lower.includes('우수') || lower.includes('장려')){
    score += 4;
    p.award = '수상/인정 가능성 있음(확정 아님 — 확인 필요)';
  }
  return { score, sourced: true, name: p.name, description: p.description, language: p.language, readme: p.readme, text: p.text, url: p.url };
}

async function analyzeHandler(req, res){
  if(req.method !== 'POST'){
    return res.status(405).json({ error: 'POST만 허용' });
  }

  let body;
  try {
    let rawBody;
    if(req.body !== undefined && req.body !== null){
      rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    } else {
      rawBody = '';
    }
    body = rawBody ? JSON.parse(rawBody) : {};
    if(typeof body !== 'object' || Array.isArray(body)){
      body = {};
    }
  } catch(e){
    return res.status(400).json({ error: '입력 형식 오류' });
  }

  const mode = body.mode || 'jobpost';
  const jobpost = (body.jobpost || '').trim();
  const company = (body.company || '').trim();
  const projects = (body.projects || '').trim();
  const outputMode = body.outputMode || 'both';
  const jobLabel = (body.jobLabel || '').trim();

  let extractedHtml = null;
  if(jobpost && (jobpost.startsWith('http://') || jobpost.startsWith('https://'))){
    extractedHtml = await fetchHtml(jobpost, 'jd-fit-mvp/1.0');
  }

  const repoUrlsFromText = extractRepoNamesFromText(projects);
  const githubThings = resolveGitHubLinks(repoUrlsFromText.length ? repoUrlsFromText : [projects]);
  const profileCandidates = githubThings.filter(x => x && x.profile);
  const directRepoUrls = githubThings.filter(x => x && x.profile === undefined && x.raw === undefined);

  const userRepoMap = {};
  const repoFilesMap = {};

  for(const p of profileCandidates){
    const user = p.profile.match(/github\.com\/([A-Za-z0-9_.-]+)/i);
    if(!user) continue;
    const userKey = user[1];
    const token = process.env.GITHUB_TOKEN;
    const repos = await fetchGitHubRepos(userKey, token || null);
    if(repos && Array.isArray(repos)){
      userRepoMap[userKey] = repos;
      for(const r of repos){
        const name = r.full_name || r.name;
        const lang = r.language || '';
        const depFile = decideDepFile(lang);
        let readme = '';
        let depContent = '';
        try {
          const raw = await fetchText('https://api.github.com/repos/' + encodeURIComponent(name) + '/readme', 'jd-fit-mvp/1.0');
          const parsed = JSON.parse(raw);
          if(parsed && parsed.content){
            readme = Buffer.from(parsed.content, 'base64').toString('utf8');
          }
        } catch(e){}
        if(depFile){
          try {
            depContent = await fetchFileContent(name, depFile);
          } catch(e){}
        }
        repoFilesMap[name] = {
          readme,
          depFile: depContent,
          depFileName: depFile || '',
          language: lang
        };
      }
    }
  }

  for(const u of directRepoUrls){
    const repoSrc = u.replace('https://github.com/','');
    if(userRepoMap[repoSrc]) continue;
    try {
      const token = process.env.GITHUB_TOKEN;
      const resp = await fetchText('https://api.github.com/repos/' + encodeURIComponent(repoSrc), 'jd-fit-mvp/1.0');
      const info = JSON.parse(resp);
      if(info && info.full_name){
        userRepoMap[repoSrc] = [info];
      }
    } catch(e){}
  }

  const result = analyze({
    mode,
    jobpost,
    company,
    projects,
    outputMode,
    jobLabel,
    extractedHtml,
    githubRepos: userRepoMap,
    repoFilesMap: repoFilesMap
  });

  const safeResult = JSON.parse(JSON.stringify(result));
  return res.status(200).json(safeResult);
}

module.exports = analyzeHandler;
