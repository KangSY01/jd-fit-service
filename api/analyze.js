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

const {
  fetchText,
  fetchFileContent,
  decideDepFile,
  resolveGitHubLinks,
  fetchGitHubRepos,
  extractRepoNamesFromText
} = require('../lib/github');

const {
  fetchHtml,
  stripHtml,
  extractJobPostImageUrl
} = require('../lib/jobpost');

const {
  ocrImageUrl
} = require('../lib/ocr');

const {
  analyze
} = require('../lib/scoring');

const {
  runTimely
} = require('../lib/timely');

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
  let jobpost = (body.jobpost || '').trim();
  const company = (body.company || '').trim();
  const projects = (body.projects || '').trim();
  const outputMode = body.outputMode || 'both';
  const jobLabel = (body.jobLabel || '').trim();

  let extractedHtml = null;
  let imagePostLikely = false;
  const SHORT_TEXT_LIMIT = 200;

  if(jobpost && (jobpost.startsWith('http://') || jobpost.startsWith('https://'))){
    extractedHtml = await fetchHtml(jobpost, 'jd-fit-mvp/1.0');
    if(extractedHtml && extractedHtml.ok && extractedHtml.html){
      const cleanedText = stripHtml(extractedHtml.html);
      if(cleanedText.length < SHORT_TEXT_LIMIT){
        imagePostLikely = true;
        extractedHtml = {
          ok: true,
          html: extractedHtml.html,
          status: extractedHtml.status,
          shortTextLen: cleanedText.length,
          imagePostLikely: true,
          shortTextNote: '추출된 텍스트가 200자 미만이라 이미지 기반 공고일 가능성이 있음'
        };

        const imageUrl = extractJobPostImageUrl(extractedHtml.html);
        if(imageUrl){
          const ocrText = await ocrImageUrl(imageUrl);
          if(ocrText !== null){
            jobpost = ocrText;
          }
        }
      }
    }
  }

  const repoUrlsFromText = extractRepoNamesFromText(projects);
  const githubThings = await resolveGitHubLinks(repoUrlsFromText.length ? repoUrlsFromText : [projects]);
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

  const factSheet = {
    mode,
    jobpost,
    company,
    projects,
    outputMode,
    jobLabel,
    extractedHtml,
    userRepoMap,
    repoFilesMap,
    imagePostLikely
  };

  let result;
  try {
    const timelyResult = await runTimely(factSheet);
    if(timelyResult !== null){
      result = timelyResult;
    } else {
      result = await analyze({
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
    }
  } catch (e) {
    result = await analyze({
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
  }

  const safeResult = JSON.parse(JSON.stringify(result));
  return res.status(200).json(safeResult);
}

module.exports = analyzeHandler;
