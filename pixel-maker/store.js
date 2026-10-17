(function(root,factory){const M=typeof module!=='undefined'&&module.exports?require('./model.js'):root.PixelModel;const api=factory(M);if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PixelStore=api;})(globalThis,(M)=>{
 'use strict';
 function createGalleryStore(api,options={}){
   let tail=Promise.resolve(),serial=0;const pending=new Map();
   async function load(profileId){
     const record=options.readRecord?await options.readRecord(profileId):await api.save.get(profileId,'pixel-maker','gallery');
     if(record==null)return null;
     if(options.readRecord&&record.kind!=='json')throw new Error('Invalid gallery record');
     return M.validateGallery(record.value);
   }
   function save(profileId,gallery){
     const entry={profileId,gallery:M.validateGallery(gallery),serial:++serial};pending.set(profileId,entry);
     const job=tail.catch(()=>{}).then(async()=>{
       await api.save.put(profileId,'pixel-maker','gallery',entry.gallery);
       if(pending.get(profileId)?.serial===entry.serial)pending.delete(profileId);
     });
     tail=job;return job;
   }
   async function flush(){await tail;if(pending.size)throw new Error('Unsaved pictures');}
   async function retry(){const jobs=[...pending.values()].map(e=>save(e.profileId,e.gallery));await Promise.all(jobs);await flush();}
   return {load,save,flush,retry,pending:()=>[...pending.values()].map(e=>({profileId:e.profileId,gallery:JSON.parse(JSON.stringify(e.gallery))}))};
 }
 return {createGalleryStore};
});
