  let profileSaveBusy = false;
  const profilePhotoBucket='fuel-profile-photos';
  function ownProfilePhotoPath(user) {
    const path=user?.user_metadata?.fuel_avatar_path;
    return typeof path==='string' && path.startsWith(user.id+'/') && /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\.jpg$/.test(path)?path:null;
  }
  let profilePhotoCache=null,profilePhotoRequest=0;
  function clearProfilePhotoCache(){if(profilePhotoCache?.url)URL.revokeObjectURL(profilePhotoCache.url);profilePhotoCache=null;}
  window.refreshFuelProfilePhoto=async user=>{
    const request=++profilePhotoRequest,path=user?.id?ownProfilePhotoPath(user):null,active=client,generation=connectionGeneration;
    if(!path || !active || !permissionsReady || currentPermissions?.can_read!==true){clearProfilePhotoCache();return null;}
    if(profilePhotoCache?.path!==path || profilePhotoCache?.client!==active || profilePhotoCache?.generation!==generation){
      clearProfilePhotoCache();
      const entry={path,client:active,generation,url:null,promise:null};profilePhotoCache=entry;
      entry.promise=(async()=>{try{const result=await active.storage.from(profilePhotoBucket).download(path);if(result.error || !result.data || profilePhotoCache!==entry)return null;entry.url=URL.createObjectURL(result.data);return entry.url;}catch(_){return null;}})();
    }
    const url=await profilePhotoCache.promise;
    if(request!==profilePhotoRequest || active!==client || generation!==connectionGeneration || headerSignedInUser?.id!==user.id)return null;
    const node=document.getElementById('fuelHeaderAvatar');
    if(url && node){const fallback=node.textContent;node.textContent='';const img=document.createElement('img');img.alt='';img.src=url;img.onerror=()=>{if(img.parentNode===node)node.textContent=fallback;};node.appendChild(img);}
    return url;
  };
  window.getFuelProfilePhoto=async id=>headerSignedInUser?.id===id?window.refreshFuelProfilePhoto(headerSignedInUser):null;
  window.saveFuelProfile = async (raw,photo) => {
    const name = String(raw ?? '').trim();
    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('Enter a full name between 1 and 80 characters.');
    if(photo!==undefined && photo!==null && (!(photo instanceof Blob) || photo.type!=='image/jpeg' || !photo.size || photo.size>1048576))throw new Error('Choose a valid profile photo under 1 MB after cropping.');
    if (profileSaveBusy) throw new Error('Your profile is already being saved.');
    if (!client || !permissionsReady || currentPermissions?.can_read !== true || !headerSignedInUser?.id) throw new Error('Sign in before saving your profile.');
    const active = client, generation = connectionGeneration, id = headerSignedInUser.id;
    profileSaveBusy = true;
    const current = () => client === active && connectionGeneration === generation && headerSignedInUser?.id === id && permissionsReady;
    try {
      const verified = await active.auth.getUser();
      if (verified.error) throw verified.error;
      if (!current() || verified.data?.user?.id !== id) throw new Error('Account changed. Reopen My Profile before saving.');
      const oldPath=ownProfilePhotoPath(verified.data.user),data={full_name:name};let newPath;
      if(photo===null)data.fuel_avatar_path=null;
      else if(photo!==undefined){
        const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
        newPath=id+'/'+Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('')+'.jpg';
        const upload=await active.storage.from(profilePhotoBucket).upload(newPath,photo,{contentType:'image/jpeg',upsert:false});
        if(upload.error)throw upload.error;
        if(!current())throw new Error('Account changed. Reopen My Profile before saving.');
        data.fuel_avatar_path=newPath;
      }
      const result = await active.auth.updateUser({ data });
      if (result.error) throw result.error;
      if (!current() || result.data?.user?.id !== id) throw new Error('Account changed. Reopen My Profile to check your saved profile.');
      if (result.data.user.user_metadata?.full_name !== name || (photo!==undefined && result.data.user.user_metadata?.fuel_avatar_path!==data.fuel_avatar_path)) throw new Error('The server did not confirm your profile. Reopen My Profile to check it.');
      headerSignedInUser = result.data.user;
      window.renderFuelHeaderIdentity?.(headerSignedInUser, currentPermissions);
      let warning='';
      if(photo!==undefined && oldPath && oldPath!==newPath){try{const removed=await active.storage.from(profilePhotoBucket).remove([oldPath]);if(removed.error)warning='Profile saved. The previous photo could not be removed from storage.';}catch(_){warning='Profile saved. The previous photo could not be removed from storage.';}}
      return { id, email: headerSignedInUser.email || '', fullName: name, warning };
    } finally { profileSaveBusy = false; }
  };
  window.saveFuelProfileName=raw=>window.saveFuelProfile(raw);
