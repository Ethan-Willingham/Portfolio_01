import { serve } from './browser.mjs';
const local=process.env.CHAIN_REACTION_RESEARCH;
if(!local)throw Error('Set CHAIN_REACTION_RESEARCH');
const server=await serve(local);
console.log(server.url+'/local/chain-reaction-lab.html');
let closing=false;
const close=async()=>{if(closing)return;closing=true;await server.close();process.exit(0);};
process.on('SIGINT',close);process.on('SIGTERM',close);
setTimeout(close,3600000);
