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

function extractRepoNamesFromText(text){
  const re = /github\.com[:/]([^/]+)\/([A-Za-z0-9_.-]+)/g;
  const out = [];
  let m;
  while((m = re.exec(text))){
    out.push(m[0]);
  }
  return out;
}

module.exports = {
  fetchText,
  fetchFileContent,
  decideDepFile,
  resolveGitHubLinks,
  fetchGitHubRepos,
  extractRepoNamesFromText
};
