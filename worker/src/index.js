const json = (body, status=200, headers={}) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type":"application/json; charset=utf-8", ...headers }
});

function cors(env, request) {
  const origin = request.headers.get("origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(x=>x.trim()).filter(Boolean);
  return {
    "access-control-allow-origin": allowed.includes(origin) ? origin : (allowed[0] || "null"),
    "access-control-allow-methods":"GET,POST,OPTIONS",
    "access-control-allow-headers":"content-type,x-manager-password",
    "access-control-max-age":"86400",
    "vary":"Origin"
  };
}

const safeEqual = (a,b) => {
  a=String(a||""); b=String(b||""); if(a.length!==b.length)return false;
  let diff=0; for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i); return diff===0;
};
const slug = value => String(value||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const itemId = item => item.id || `${slug(item.product)}--${slug(item.strength)}`;
const now = () => new Date().toISOString();

async function gh(env, path, init={}) {
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`, {
    ...init,
    headers: { "accept":"application/vnd.github+json", "authorization":`Bearer ${env.GITHUB_TOKEN}`, "x-github-api-version":"2022-11-28", "user-agent":"ThatPepLab-InventoryManager", ...(init.headers||{}) }
  });
  if(!response.ok){ const body=await response.text(); const error=new Error(`GitHub ${response.status}: ${body.slice(0,180)}`); error.status=response.status; throw error; }
  return response.json();
}

async function readFile(env, path, fallback) {
  try { const result=await gh(env,path); return {data:JSON.parse(atob(result.content.replace(/\n/g,""))),sha:result.sha}; }
  catch(error){ if(error.status===404)return {data:fallback,sha:null}; throw error; }
}

async function writeFile(env, path, data, sha, message) {
  const body={message,content:btoa(unescape(encodeURIComponent(JSON.stringify(data,null,2)+"\n"))),branch:env.GITHUB_BRANCH||"main"};
  if(sha)body.sha=sha;
  return gh(env,path,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
}

function normalizeItems(items) {
  return (Array.isArray(items)?items:[]).map(raw => ({
    ...raw,
    id:itemId(raw), product:String(raw.product||"").trim(), strength:String(raw.strength||"").trim(),
    sku:String(raw.sku||"").trim(), category:String(raw.category||"").trim(), quantity:Math.max(0,Math.trunc(Number(raw.quantity)||0)),
    moreOnWay:Boolean(raw.moreOnWay), incomingQuantity:Math.max(0,Math.trunc(Number(raw.incomingQuantity)||0)), expectedArrival:String(raw.expectedArrival||"")
  })).sort((a,b)=>a.product.localeCompare(b.product)||a.strength.localeCompare(b.strength,undefined,{numeric:true}));
}

function entry(item, action, actionLabel, delta, note, before, after, undoable=true) {
  return {id:crypto.randomUUID(),itemId:item.id,label:`${item.product} ${item.strength}`,action,actionLabel,delta,note:note||"",before,after,timestamp:now(),undoable,undone:false};
}

function publicPayload(items, history, message="") { return {items:normalizeItems(items),history:(history||[]).slice(0,100),message}; }

async function handle(env, request) {
  const invPath=env.INVENTORY_PATH||"inventory.json", histPath=env.HISTORY_PATH||"manager-history.json";
  const inv=await readFile(env,invPath,[]), hist=await readFile(env,histPath,[]);
  let items=normalizeItems(inv.data), history=Array.isArray(hist.data)?hist.data:[];
  if(request.method==="GET")return publicPayload(items,history);

  const input=await request.json(); const action=input.action; let message="Inventory updated"; let record=null;
  if(action==="adjust"){
    const i=items.findIndex(x=>x.id===input.id); if(i<0)throw new Error("Product not found");
    const delta=Math.trunc(Number(input.delta)); if(!delta)throw new Error("Adjustment must be a non-zero whole number");
    const before={...items[i]}, next=Math.max(0,before.quantity+delta), actual=next-before.quantity; items[i]={...before,quantity:next,updatedAt:now()};
    record=entry(items[i],"adjust",input.note|| (actual<0?"Sold":"Restocked"),actual,input.note,before,items[i]); message=`${items[i].product} is now ${next}`;
  } else if(action==="save"){
    const raw=input.item||{}; if(!String(raw.product||"").trim()||!String(raw.strength||"").trim())throw new Error("Product and strength are required");
    const clean=normalizeItems([raw])[0], i=items.findIndex(x=>x.id===raw.id); const before=i>=0?{...items[i]}:null;
    clean.id=raw.id||itemId(clean); clean.updatedAt=now();
    if(items.some((x,index)=>x.id===clean.id&&index!==i))throw new Error("That product and strength already exist");
    if(i>=0)items[i]=clean; else items.push(clean);
    const delta=clean.quantity-(before?.quantity||0); record=entry(clean,"save",before?"Product edited":"Product added",delta,"",before,clean,Boolean(before)); message=before?"Product saved":"Product added";
  } else if(action==="receive"){
    const i=items.findIndex(x=>x.id===input.id); if(i<0)throw new Error("Product not found"); const before={...items[i]};
    const amount=Math.max(0,Math.trunc(Number(before.incomingQuantity)||0)); if(!before.moreOnWay||!amount)throw new Error("No incoming quantity is set");
    items[i]={...before,quantity:before.quantity+amount,moreOnWay:false,incomingQuantity:0,expectedArrival:"",updatedAt:now()};
    record=entry(items[i],"receive","Shipment received",amount,`Expected arrival was ${before.expectedArrival||"not set"}`,before,items[i]); message=`Received ${amount} for ${items[i].product}`;
  } else if(action==="undo"){
    const target=history.find(x=>x.undoable&&!x.undone); if(!target)throw new Error("There is no change to undo"); const i=items.findIndex(x=>x.id===target.itemId); if(i<0||!target.before)throw new Error("The last change cannot be undone");
    const current={...items[i]}; items[i]={...target.before,updatedAt:now()}; target.undone=true; target.undoneAt=now();
    record=entry(items[i],"undo","Undo",items[i].quantity-current.quantity,`Undid: ${target.actionLabel}`,current,items[i],false); message="Last quantity change undone";
  } else throw new Error("Unknown action");

  items=normalizeItems(items); if(record)history=[record,...history].slice(0,500);
  await writeFile(env,invPath,items,inv.sha,`Inventory Manager: ${record?.actionLabel||action}`);
  try { await writeFile(env,histPath,history,hist.sha,`Inventory Manager history: ${record?.actionLabel||action}`); }
  catch(error){ console.error("History write failed",error); }
  return publicPayload(items,history,message);
}

export default {
  async fetch(request, env) {
    const headers=cors(env,request);
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
    if(!safeEqual(request.headers.get("x-manager-password"),env.MANAGER_PASSWORD))return json({error:"Incorrect manager password"},401,headers);
    try { return json(await handle(env,request),200,headers); }
    catch(error){ console.error(error); return json({error:error.message||"Inventory update failed"},error.status===404?404:400,headers); }
  }
};
