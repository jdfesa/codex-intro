import {execFile as rawExec} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:net';
import {realpath} from 'node:fs/promises';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {buildInjection} from '../../shared/desktop/payload.mjs';
import {connect,pageTarget,localSocket} from '../../shared/desktop/cdp.mjs';
const exec=promisify(rawExec);
const root=resolve(dirname(fileURLToPath(import.meta.url)), '../..');
async function command(file,args){return (await exec(file,args,{timeout:15000,maxBuffer:1024*1024})).stdout.trim();}
async function freePort(){
  return new Promise((resolve,reject)=>{const server=createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});});
}
export async function verifyListener(port,bundle){
  const records=await command('/usr/sbin/lsof',['-nP',`-iTCP:${port}`,'-sTCP:LISTEN','-Fpn']);
  const pids=[...records.matchAll(/^p(\d+)$/gm)].map(match=>Number(match[1]));
  const addresses=[...records.matchAll(/^n(.+)$/gm)].map(match=>match[1]);
  if(!pids.length||!addresses.length||addresses.some(value=>value!==`127.0.0.1:${port}`))throw new Error('Debug port is not restricted to 127.0.0.1; connection refused');
  for(const pid of new Set(pids)){
    const uid=Number(await command('/bin/ps',['-p',String(pid),'-o','uid=']));
    if(uid!==process.getuid())throw new Error('Debug port owner does not match the current user');
    const files=await command('/usr/sbin/lsof',['-a','-p',String(pid),'-d','txt','-Fn']);
    const executable=files.split('\n').find(line=>line.startsWith('n'))?.slice(1);
    if(!executable||!(await realpath(executable)).startsWith(bundle+sep))throw new Error('Debug port does not belong to the target Codex app');
  }
}
async function main(){
  const i=process.argv.indexOf('--bundle');if(i<0||!process.argv[i+1])throw new Error('Launch the Codex Intro app with the pink icon');
  const bundle=await realpath(process.argv[i+1]);
  await command('/usr/bin/codesign',['--verify','--deep','--strict',bundle]);
  const identifier=await command('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',join(bundle,'Contents/Info.plist')]);
  if(identifier!=='com.openai.codex')throw new Error('Application identifier does not match');
  const {stderr:signature}=await exec('/usr/bin/codesign',['-dv','--verbose=4',bundle],{timeout:15000});
  if(!signature.includes('TeamIdentifier=2DC432GLL2'))throw new Error('Expected OpenAI signature not found; launch refused');
  const source=await buildInjection(root),port=await freePort();
  await command('/usr/bin/open',['-n','-a',bundle,'--args','--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${port}`]);
  const deadline=Date.now()+45000;let lastError='Waiting for the Codex page';
  while(Date.now()<deadline){
    let client;
    try{
      await verifyListener(port,bundle);
      const response=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1200),redirect:'error'});
      if(!response.ok)throw new Error('Debug page is not ready yet');
      const targets=await response.json();if(!Array.isArray(targets))throw new Error('Invalid page list');
      const target=targets.find(pageTarget);if(!target)throw new Error('Main window not found yet');
      client=await connect(localSocket(target.webSocketDebuggerUrl,port));
      const result=await client.call('Runtime.evaluate',{expression:source,returnByValue:true,awaitPromise:true});
      if(result.exceptionDetails||result.result?.value?.installed!==true)throw new Error('Could not load the appearance script');
      for(let attempt=0;attempt<50;attempt++){
        const answer=await client.call('Runtime.evaluate',{expression:'globalThis.__aemeathExtension?.status()',returnByValue:true});
        const state=answer.result?.value;
        if(state?.ready){console.log('Intro is playing in Codex. The helper will exit; use Cmd+Option+B for appearance settings.');return;}
        if(state?.phase==='failed'||state?.phase==='timeout')throw new Error('Intro assets failed to load; overlay removed');
        await delay(100);
      }
      throw new Error('Intro startup confirmation timed out');
    }catch(error){lastError=error.message;}
    finally{client?.close();}
    await delay(150);
  }
  throw new Error('This app version could not be integrated: '+lastError+'. The installed app was not modified. Fully quit and open its original icon to close the debug port.');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])main().catch(error=>{console.error(error.message);process.exitCode=1;});
