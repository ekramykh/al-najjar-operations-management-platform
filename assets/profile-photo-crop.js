function fuelProfileCropGeometry(width,height,zoom=1,panX=0,panY=0){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Invalid image dimensions.');
 const z=Math.max(1,Math.min(3,Number(zoom)||1)),size=Math.min(width,height)/z;
 const x=(width-size)/2*(1+Math.max(-1,Math.min(1,(Number(panX)||0)/100)));
 const y=(height-size)/2*(1+Math.max(-1,Math.min(1,(Number(panY)||0)/100)));
 return {x,y,size};
}
