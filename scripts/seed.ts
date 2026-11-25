import {db, merchant, day} from '../lib/db'
const names = ['สมชาย','พิมพ์ชนก','ณัฐวุฒิ','ร้านใบชา','กมลวรรณ','สตูดิโอเดือน','นภัส','บริษัท แสงเช้า']
const jobs = ['ออกแบบเว็บไซต์','ภาพถ่ายสินค้า','ออกแบบบรรจุภัณฑ์','ค่ามัดจำงานพิมพ์']
async function seed(){
 for(let i=0;i<24;i++){
  const paid=i<16
  const createdAt=new Date(Date.now()-(i===23?0.04:1+i%9)*day)
  const order=await db.order.create({data:{merchant,customer:names[i%8],description:jobs[i%4],amount:(850+i*175)*100,status:paid?'PAID':'OPEN',createdAt}})
  const link=await db.link.create({data:{orderId:order.id,activeSlot:order.id,methods:'QR,CARD',expires:new Date(Date.now()+(i===16||i===17?-1:2)*day),createdAt}})
  const statuses=paid?(i===0?['FAILED','SUCCESS']:['SUCCESS']):i===18||i===19?['FAILED']:i===20?['UNKNOWN']:['PENDING']
  for(const [j,status] of statuses.entries()) await db.attempt.create({data:{merchant,orderId:order.id,linkId:link.id,method:status==='FAILED'||i%3===0?'CARD':'QR',status,requestId:crypto.randomUUID(),settlement:status==='SUCCESS'?order.id:null,createdAt:new Date(+createdAt+j*1000)}})
 }
 console.log(await db.attempt.groupBy({by:['status'],_count:true}))
}
seed().finally(()=>db.$disconnect())
