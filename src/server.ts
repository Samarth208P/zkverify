import {createServer} from 'node:http';
import {createAgent} from './agent.js';
import {MemoryStore} from './store.js';
const agent=createAgent({secret:process.env.AGENT_GAMES_HMAC_SECRET??'',saltKey:process.env.PROOF_SALT_SECRET,store:new MemoryStore()});
createServer(async(req,res)=>{
  if(!['/agent','/health'].includes((req.url??'').split('?')[0])){res.writeHead(404);res.end();return;}
  try {
    const init:RequestInit & {duplex?:string}={method:req.method,headers:req.headers as Record<string,string>};
    if(!['GET','HEAD'].includes(req.method??'GET')){init.body=req as unknown as ReadableStream;init.duplex='half';}
    const response=await agent(new Request(`http://localhost${req.url}`,init));
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end();}
}).listen(Number(process.env.PORT??8787),'127.0.0.1',()=>console.log('Astrex-1 local development server listening; replay state is in memory.'));
