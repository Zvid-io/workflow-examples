import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '../src/client.js';
import {finishEpisode, submitEpisode} from '../src/run.js';

// A pending response that only finishes on cancellation. The watchdog keeps the
// test alive and fails if the request timeout is accidentally removed.
function stalledResponse(signal) {
  return new Promise((resolve, reject) => {
    const watchdog=setTimeout(()=>reject(new Error('Request did not abort')),500);
    const abort=()=>{clearTimeout(watchdog);reject(signal.reason);};
    if(signal.aborted)abort();
    else signal.addEventListener('abort',abort,{once:true});
  });
}

test('SDK validation request aborts without automatic retries',async()=>{
  let calls=0;
  const client=createClient({apiKey:'test-key'},{requestTimeoutMs:20,fetcher:async(url,init)=>{calls++;return stalledResponse(init.signal);}});
  await assert.rejects(client.authoring.validate({payload:{scenes:[]}}),error=>error.cause?.name==='TimeoutError');
  assert.equal(calls,1);
});

test('stalled accepted-job request honors polling deadline and preserves recovery',async()=>{
  let calls=0;const saved=[];
  const client=createClient({apiKey:'test-key'},{fetcher:async(url,init)=>{calls++;return stalledResponse(init.signal);}});
  const row={JobId:'saved-job',Status:'rendering'};
  await assert.rejects(finishEpisode(client,row,{timeoutMs:20,save:async()=>saved.push({...row})}),/Polling timed out/);
  assert.equal(calls,1);
  assert.equal(row.JobId,'saved-job');
  assert.equal(row.Status,'timed_out');
  assert.equal(saved.at(-1).JobId,'saved-job');
});

test('timed-out submission remains uncertain and cannot be automatically submitted again',async()=>{
  let submissions=0;
  const client=createClient({apiKey:'test-key'},{requestTimeoutMs:20,fetcher:async(url,init)=>{
    if(String(url).includes('/validate/'))return Response.json({valid:true,creditsRequired:44});
    submissions++;return stalledResponse(init.signal);
  }});
  const plan={renderKey:'one-episode',payload:{scenes:[]}},logs=[];
  const options={maxCredits:60,save:async()=>{}};
  await assert.rejects(submitEpisode(client,plan,logs,options),/uncertain/);
  assert.equal(logs[0].Status,'needs_review');
  await assert.rejects(submitEpisode(client,plan,logs,options),/saved submission/);
  assert.equal(submissions,1);
});
