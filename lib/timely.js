async function runTimely(factSheet){
  let timelySdk = null;
  try {
    timelySdk = await import('@timely-ai/sdk');
  } catch (sdkErr) {
    timelySdk = null;
  }

  if(!timelySdk || !timelySdk.createSession || !timelySdk.createMessage || !timelySdk.getMessage){
    return null;
  }

  const sessionId = timelySdk.createSession().id;
  const prompt = JSON.stringify(factSheet, null, 2);
  const userMessage = await timelySdk.createMessage({
    session_id: sessionId,
    role: 'user',
    content: prompt,
    output_type: 'json'
  });
  const assistantMessage = await timelySdk.getMessage(userMessage.id);
  return JSON.parse(assistantMessage.content);
}

module.exports = {
  runTimely
};
