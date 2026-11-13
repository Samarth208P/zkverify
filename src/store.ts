import {getStore} from '@netlify/blobs';
import {createHash} from 'node:crypto';

export interface Store {
  get<T>(key: string): Promise<T|null>;
  create(key: string, value: unknown): Promise<boolean>;
}
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function persistentStore(context: string): Store {
  const blobs=getStore({name:`astrex-v1-${context.replace(/[^a-zA-Z0-9-]/g,'-').slice(0,35)}`,consistency:'strong'});
  return {
    get: <T>(key:string)=>blobs.get(key,{type:'json'}) as Promise<T|null>,
    create: async (key,value)=>(await blobs.setJSON(key,value,{onlyIfNew:true})).modified
  };
}
export class MemoryStore implements Store {
  private values=new Map<string,unknown>();
  async get<T>(key:string) {return (this.values.get(key) as T)??null;}
  async create(key:string,value:unknown) {if(this.values.has(key))return false;this.values.set(key,structuredClone(value));return true;}
}
