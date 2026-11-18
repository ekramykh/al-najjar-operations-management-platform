import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import {validateEntity} from './validate.js';
import {deliveryPlaces} from './places.js';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
Deno.serve(async req=>{
 const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method==='OPTIONS')return reply(200,{});if(req.method!=='POST')return reply(405,{error:'POST required.'});
 try{
 const url=Deno.env.get('SUPABASE_URL');
 // This development service must never serve another project.
 if(!url?.includes('lfmuxtnurxaanixxflwc.supabase.co'))return reply(403,{error:'Staging service only.'});
 const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
 const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)return reply(401,{error:'Sign in required.'});
 const {data:auth,error:authError}=await admin.auth.getUser(token);if(authError||!auth.user)return reply(401,{error:'Invalid session.'});
 const {data:perm,error:permError}=await admin.from('app_user_permissions').select('can_read,can_add,can_edit').eq('user_id',auth.user.id).maybeSingle();
 if(permError)throw permError;if(!perm?.can_read)return reply(403,{error:'Read permission required.'});
 const body=await req.json();let result;
 if(body.action==='list'){const {data,error}=await admin.from('delivery_entities').select('*').order('number',{ascending:false}).limit(5001);if(error)throw error;if(data.length>5000)throw Error('Too many entries; contact administrator.');result={entities:data,canWrite:perm.can_add===true||perm.can_edit===true,canAdd:perm.can_add===true,canEdit:perm.can_edit===true};}
 else if(body.action==='history'){const {data,error}=await admin.from('delivery_audit').select('*').eq('entity_id',body.id).order('sequence',{ascending:false}).range(Number(body.offset)||0,(Number(body.offset)||0)+49);if(error)throw error;const {data:creation,error:creationError}=await admin.from('delivery_audit').select('*').eq('entity_id',body.id).order('sequence',{ascending:true}).limit(1);if(creationError)throw creationError;result={events:data,record_info:creation?.[0]||null};}
 else if(body.action==='save'){
 if(!(body.revision===0?perm.can_add===true:perm.can_edit===true))return reply(403,{error:body.revision===0?'Add permission required.':'Edit permission required.'});
 validateEntity(body.kind,body.data,deliveryPlaces);
 if(!Number.isInteger(body.revision)||body.revision<0||typeof body.reason!=='string'||body.reason.length>500)throw Error('Invalid revision or reason.');
 if(body.kind==='order')for(const id of body.data.tripIds){const {data:t}=await admin.from('delivery_entities').select('kind').eq('id',id).maybeSingle();if(t?.kind!=='trip')throw Error('Linked trip unavailable.');}
 if(body.data.proofPath&&!body.data.proofPath.startsWith(body.id+'/'))throw Error('Invalid proof reference.');
 const context=body.context||{};if(body.context&&(typeof context.device_id!=='string'||context.device_id.length>100||typeof context.client_at!=='string'||context.client_at.length>50||!Number.isFinite(Date.parse(context.client_at))))throw Error('Browser identification is required.');body.data._audit={actor_name:String(auth.user.user_metadata?.full_name||'').slice(0,120),device_id:context.device_id||'not-supplied',client_at:context.client_at||null};
 const {data,error}=await admin.rpc('delivery_commit',{p_id:body.id,p_kind:body.kind,p_revision:body.revision,p_data:body.data,p_actor:auth.user.id,p_email:auth.user.email,p_reason:body.reason});if(error)throw error;result={entity:data};
 }else if(body.action==='proofUpload'){
 if(perm.can_add!==true&&perm.can_edit!==true)return reply(403,{error:'Write permission required.'});
 const {data:existing,error:existingError}=await admin.from('delivery_entities').select('id').eq('id',body.id).maybeSingle();if(existingError)throw existingError;
 if(!(existing?perm.can_edit===true:perm.can_add===true))return reply(403,{error:existing?'Edit permission required.':'Add permission required.'});
 if(!/^[0-9a-f-]{36}$/i.test(body.id)||!['image/jpeg','image/png','application/pdf'].includes(body.mime)||typeof body.base64!=='string'||body.base64.length>1400000)throw Error('Invalid attachment (maximum 1 MB).');
 const bytes=Uint8Array.from(atob(body.base64),c=>c.charCodeAt(0));if(bytes.length>1048576)throw Error('Maximum attachment size is 1 MB.');
 const sig=Array.from(bytes.slice(0,8)).join(',');if(body.mime==='image/jpeg'&&!sig.startsWith('255,216,255')||body.mime==='image/png'&&!sig.startsWith('137,80,78,71,13,10,26,10')||body.mime==='application/pdf'&&!sig.startsWith('37,80,68,70,45'))throw Error('File content does not match type.');
 const path=body.id+'/'+crypto.randomUUID();const {error}=await admin.storage.from('delivery-proof').upload(path,bytes,{contentType:body.mime,upsert:false});if(error)throw error;result={path};
 }else if(body.action==='proofRead'){
 const {data:row}=await admin.from('delivery_entities').select('data').eq('id',body.id).maybeSingle();if(!row?.data?.proofPath)throw Error('No attachment.');const {data,error}=await admin.storage.from('delivery-proof').createSignedUrl(row.data.proofPath,60);if(error)throw error;result={url:data.signedUrl};
 }else return reply(400,{error:'Unsupported action.'});
 return reply(200,result);
 }catch(e){return reply(400,{error:e.message||'Delivery operation failed.'});}
});

