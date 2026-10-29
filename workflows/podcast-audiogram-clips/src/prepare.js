import Parser from 'rss-parser';
import {execute} from './workflow.js';

export async function boundedDownload(response, maxBytes) {
  if (!response.ok) throw new Error(`Audio download returned HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel(); throw new Error('Audio exceeds configured byte limit; source may have ignored Range');
  }
  const reader=response.body?.getReader();
  if (!reader) throw new Error('Audio response has no body');
  const chunks=[];let size=0;
  try {for (;;) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new Error('Audio exceeds configured byte limit; source may have ignored Range');}chunks.push(value);}}
  finally {reader.releaseLock();}
  if (!size) throw new Error('Audio sample is empty');
  return Buffer.concat(chunks.map(x=>Buffer.from(x)));
}

async function requestJson(url,options,fetchImpl) {
  const res=await fetchImpl(url,{...options,signal:AbortSignal.timeout(120_000)});
  if(!res.ok)throw new Error(`Service returned HTTP ${res.status}; inspect credentials and quota before retrying`);
  return res.json();
}

export async function preparePodcast({config,client,keys,save,saveBinary,fetchImpl=fetch}) {
  for(const name of ['ELEVENLABS_API_KEY','OPENROUTER_API_KEY'])if(!keys[name])throw new Error(`${name} is required for live preparation`);
  if(!/^https:\/\//.test(config.feedUrl||''))throw new Error('Set feedUrl to your public HTTPS podcast RSS feed');
  save('preparation-status.json',{state:'fetching-feed',startedAt:new Date().toISOString()});
  const res=await fetchImpl(config.feedUrl,{signal:AbortSignal.timeout(30_000)});
  if(!res.ok)throw new Error(`Feed returned HTTP ${res.status}`);
  const parser=new Parser({timeout:30000});
  const feed=await parser.parseString(await res.text());
  const episode=execute('Pick latest episode',feed.items,{Config:config})[0].json;
  save('episode.json',episode);
  const response=await fetchImpl(episode.audioUrl,{headers:{Range:episode.rangeHeader,'User-Agent':'ZvidAudiogram/1.0 (+https://zvid.io)'},signal:AbortSignal.timeout(120_000)});
  const bytes=await boundedDownload(response,episode.maxBytes);
  saveBinary('source-audio.mp3',bytes);
  const mime=response.headers.get('content-type')?.split(';')[0]||'audio/mpeg';
  const form=new FormData();form.set('model_id',config.sttModel);form.set('timestamps_granularity','word');form.set('file',new Blob([bytes],{type:mime}),'episode.mp3');
  // Exactly one transcription request. Never retry an uncertain paid request automatically.
  save('preparation-status.json',{state:'transcription-pending',bytes:bytes.length});
  const transcript=await requestJson('https://api.elevenlabs.io/v1/speech-to-text',{method:'POST',headers:{'xi-api-key':keys.ELEVENLABS_API_KEY},body:form},fetchImpl);
  save('transcript.json',transcript);
  const timed=execute('Read transcript',[transcript],{Config:config,'Fetch episode audio':{}})[0].json;
  save('preparation-status.json',{state:'upload-pending'});
  const uploaded=await client.uploads.create(new Blob([bytes],{type:mime}),{fileName:'episode.mp3'});
  if(!uploaded?.url)throw new Error('Audio upload returned no URL');
  save('audio-upload.json',{url:uploaded.url});
  save('preparation-status.json',{state:'selection-pending'});
  let selection;
  try {selection=await requestJson('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${keys.OPENROUTER_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:config.llmModel,response_format:{type:'json_object'},messages:[{role:'system',content:'You are a podcast clip producer. You pick the moments that make people stop scrolling, and you return JSON only.'},{role:'user',content:timed.promptText}]})},fetchImpl);}
  catch {selection={};save('selection-warning.json',{message:'Model selection unavailable. Canonical fallback selections used; inspect clip context.'});}
  save('selection.json',selection);
  const prepared={config,episode,transcript,selection,audioUrl:uploaded.url};
  save('prepared.json',prepared);save('preparation-status.json',{state:'prepared',finishedAt:new Date().toISOString()});
  return prepared;
}
