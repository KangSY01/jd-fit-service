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

async function fetchHtml(url, ua){
  const fetchText = require('./github').fetchText;
  try {
    const body = await fetchText(url, ua);
    return { ok: true, html: body, status: 200 };
  } catch(e){
    return { ok: false, error: e && e.message ? String(e.message) : String(e), status: null };
  }
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

module.exports = {
  stripHtml,
  fetchHtml,
  parseJobPost,
  extractKeywords
};
