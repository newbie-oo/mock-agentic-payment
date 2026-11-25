import {z} from 'zod'
import * as s from './service'
import {db} from './db'
const empty=z.object({}).strict()
type Context={runId:string,m:string}
function tool<T extends z.ZodType>(description:string,schema:T,handler:(a:z.output<T>,c:Context)=>Promise<unknown>){
 return {description,schema,call:(args:unknown,c:Context)=>handler(schema.parse(args),c)}
}
export const registry={
 get_dashboard_metrics:tool('Current merchant totals in satang; all attempts in rate denominator.',empty,(_,c)=>s.metrics(c.m)),
 list_transactions:tool('Page of recent attempts with current order status.',s.pageInput,(a,c)=>s.transactions(a.page,c.m)),
 get_transaction:tool('Read one attempt.',s.txInput,(a,c)=>db.attempt.findFirstOrThrow({where:{id:a.transactionId,merchant:c.m},include:{order:true}})),
 list_unpaid_payments:tool('Page of 12 open orders, latest link and attempt.',s.pageInput,(a,c)=>s.orders(a.page,true,c.m)),
 get_payment_history:tool('Recent 12 attempts and 12 links for an order.',s.orderInput,(a,c)=>db.order.findFirstOrThrow({where:{id:a.orderId,merchant:c.m},include:{attempts:{orderBy:{createdAt:'desc'},take:12},links:{orderBy:{createdAt:'desc'},take:12}}})),
 get_payment_methods:tool('Enabled methods for checkout.',s.linkInput,async(a,c)=>(await s.getLink(a.linkId,c.m)).methods.split(',')),
 get_payment_link:tool('Read checkout and order.',s.linkInput,(a,c)=>s.getLink(a.linkId,c.m)),
 create_payment_link:tool('Propose a new order and link for human approval.',s.createInput,(a,c)=>s.propose(c.runId,'create_payment_link',a,c.m)),
 regenerate_payment_link:tool('Propose replacing a current link on the same order.',s.replaceInput,(a,c)=>s.propose(c.runId,'regenerate_payment_link',a,c.m)),
 draft_payment_reminder:tool('Draft a polite reminder; returns text only.',s.linkInput,async(a,c)=>{
  const l=await s.getLink(a.linkId,c.m)
  return {body:'สวัสดีค่ะ คุณ'+l.order.customer+' ขออนุญาตแจ้งยอด '+(l.order.amount/100).toLocaleString('th-TH')+' บาท สำหรับ'+l.order.description+' หากสะดวกสามารถชำระผ่านลิงก์ที่ได้รับ ขอบคุณค่ะ'}
 }),
 save_notification:tool('Propose storing a reminder locally after approval.',s.noticeInput,(a,c)=>s.propose(c.runId,'save_notification',a,c.m))
}
export type ToolName=keyof typeof registry
export const definitions=Object.entries(registry).map(([name,t])=>({type:'function',function:{name,description:t.description,parameters:z.toJSONSchema(t.schema,{io:'input',target:'draft-7'})}}))
export async function dispatch(name:string,args:unknown,c:Context){
 try{
  if(!Object.hasOwn(registry,name))throw Error('Unknown tool')
  const data=await registry[name as ToolName].call(args,c)
  await s.event(c.runId,name,'Completed '+name)
  return {success:true,data,error:null,summary:name+' completed'}
 }catch(e){
  const error=e instanceof z.ZodError?e.issues.map(i=>i.path.join('.')+' '+i.message).join(', ').slice(0,400):'Invalid or unavailable tool request'
  await s.event(c.runId,'Tool error',name.slice(0,80)+' · '+error)
  return {success:false,data:null,error,summary:'Request failed'}
 }
}
