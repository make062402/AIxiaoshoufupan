#!/usr/bin/env node
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import os from 'node:os'; import path from 'node:path'
import { loadReviewContext, missingReviewContext, saveReviewContext } from '../frontend/src/lib/reviewDraft.ts'

let passed=0; const pass=(m)=>{passed++;console.log(`PASS ${m}`)}
assert.deepEqual(missingReviewContext({}),['客户','场景标签','录音来源','语言','行业'])
const context={customerId:1,scene:'一次拜访',recordingSource:'现场录音',language:'普通话',industry:'装修'}
assert.deepEqual(missingReviewContext(context),[]); pass('五项必填缺口逐项可见，完整后才可继续')
const mem=new Map(); const storage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)}
saveReviewContext(storage,context); assert.deepEqual(loadReviewContext(storage),context); pass('完整补充信息可保存并在下一页恢复')

const root=path.resolve(import.meta.dirname,'..'), backend=path.join(root,'backend'); const require=createRequire(path.join(backend,'package.json')); const Database=require('better-sqlite3')
const dir=mkdtempSync(path.join(os.tmpdir(),'sales-review-t35-')), dbFile=path.join(dir,'app.db'); copyFileSync(path.join(backend,'data/app.db'),dbFile)
const port=33720+Math.floor(Math.random()*100); const server=spawn(process.execPath,['--experimental-strip-types','src/index.ts'],{cwd:backend,env:{...process.env,PORT:String(port),DB_FILE:dbFile,USE_MOCK:'true'},stdio:'ignore'})
try{
 for(let i=0;i<50;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/ping`)).ok)break}catch{} await new Promise(r=>setTimeout(r,100))}
 let db=new Database(dbFile,{readonly:true}); const beforeCustomers=db.prepare('select count(*) n from customers').get().n,beforeReviews=db.prepare('select count(*) n from reviews').get().n;db.close()
 const response=await fetch(`http://127.0.0.1:${port}/api/customers`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'T35临时客户',identity:'测试身份',coreNeed:'测试需求',industry:'装修'})});assert.equal(response.status,201);const created=await response.json();assert.ok(created.id)
 db=new Database(dbFile,{readonly:true});assert.equal(db.prepare('select count(*) n from customers').get().n,beforeCustomers+1);assert.equal(db.prepare('select count(*) n from reviews').get().n,beforeReviews);assert.equal(db.prepare('select name from customers where id=?').get(created.id).name,'T35临时客户');db.close();pass('当场新建写入同一 customers 表且不会提前写 reviews')
 const source=new Database(path.join(backend,'data/app.db'),{readonly:true});assert.equal(source.prepare("select count(*) n from customers where name='T35临时客户'").get().n,0);source.close();pass('专项新建只发生在临时数据库')
 console.log(`\nT35 检查点：通过 ${passed} / 4`)
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true})}
