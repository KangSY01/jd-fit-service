const { randomUUID } = require('crypto');

async function runTimely(factSheet){
  let OpenAI = null;
  try {
    const mod = await import('openai');
    OpenAI = mod.default;
  } catch (sdkErr) {
    console.error('OpenAI SDK 로드 실패');
    return null;
  }

  if(!process.env.SOLAR_API_KEY){
    console.error('SOLAR_API_KEY 없음');
    return null;
  }

  const client = new OpenAI({
    apiKey: process.env.SOLAR_API_KEY,
    baseURL: 'https://api.upstage.ai/v1'
  });

  try {
    const response = await client.chat.completions.create({
      model: 'solar-pro4',
      messages: [
        {
          role: 'system',
          content: '주어진 팩트시트만 근거로 JSON을 반환해라.'
        },
        {
          role: 'user',
          content: JSON.stringify(factSheet)
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'analysis_result',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              summary: { type: 'string' },
              jobGuess: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    role: { type: 'string' },
                    reason: { type: 'string' }
                  },
                  required: ['role', 'reason'],
                  additionalProperties: false
                }
              },
              jobpostSummary: { type: 'string' },
              checklist: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    req: { type: 'string' },
                    status: { type: 'string' },
                    basis: { type: 'string' }
                  },
                  required: ['req', 'status', 'basis'],
                  additionalProperties: false
                }
              },
              projects: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    reason: { type: 'string' },
                    award: { type: ['string', 'null'] },
                    url: { type: 'string' }
                  },
                  required: ['name', 'reason', 'award', 'url'],
                  additionalProperties: false
                }
              },
              gaps: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    req: { type: 'string' },
                    suggestion: { type: 'string' }
                  },
                  required: ['req', 'suggestion'],
                  additionalProperties: false
                }
              }
            },
            required: ['title', 'summary', 'jobGuess', 'jobpostSummary', 'checklist', 'projects', 'gaps'],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0].message.content;
    return JSON.parse(content);
  } catch (e) {
    console.error('솔라 호출 실패 - message:', e.message);
    console.error('솔라 호출 실패 - status:', e.status);
    console.error('솔라 호출 실패 - 전체:', JSON.stringify(e, null, 2));
    return null;
  }
}

module.exports = {
  runTimely
};