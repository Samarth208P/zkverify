import type {Config,Context} from '@netlify/functions';
import {createAgent} from '../../src/agent.js';
import {persistentStore} from '../../src/store.js';

export default async (request:Request,context:Context) => {
  const secret=Netlify.env.get('AGENT_GAMES_HMAC_SECRET')??'';
  const saltKey=Netlify.env.get('PROOF_SALT_SECRET');
  const store=persistentStore(context.deploy.context==='production'?'production':`preview-${context.deploy.id}`);
  return createAgent({secret,saltKey,store})(request);
};
export const config:Config={path:['/agent','/health']};
