/* Address navigation uses the public MetroGIS address-point locator. */
(function () {
  'use strict';
  var host=document.getElementById('undermap');if(!host)return;
  var form=host.querySelector('.um-address-form'),input=form.querySelector('input'),submit=form.querySelector('button');
  var output=host.querySelector('.um-address-output'),status=output.querySelector('[role="status"]'),matches=output.querySelector('.um-address-matches');
  var endpoint='https://arcgis.metc.state.mn.us/server/rest/services/Locators/AddressPointsMetro/GeocodeServer/findAddressCandidates';
  var bounds=[-93.212,44.887,-93.004,44.993],request=null,serial=0;
  function clear(){serial++;if(request)request.abort();request=null;submit.disabled=false;submit.textContent='Find';matches.replaceChildren();output.hidden=true;}
  function message(text){output.hidden=false;status.textContent=text;}
  input.addEventListener('input',clear);
  form.addEventListener('submit',async function(e){
    e.preventDefault();var query=input.value.trim();clear();
    if(query.length<6){message('Enter a Saint Paul street address.');input.focus();return;}
    var current=serial,controller=new AbortController(),timer=setTimeout(function(){controller.abort();if(current===serial)message('Address search took too long. Try again, or browse the map.');},10000);request=controller;submit.disabled=true;submit.textContent='Finding…';message('Finding matching addresses…');
    var params=new URLSearchParams({f:'json',SingleLine:/\b(?:MN|Minnesota|Saint Paul|St\.? Paul)\b/i.test(query)?query:query+", Saint Paul, MN",outSR:'4326',outFields:'Match_addr,Addr_type,City,RegionAbbr,Postal',maxLocations:'5',searchExtent:JSON.stringify({xmin:bounds[0],ymin:bounds[1],xmax:bounds[2],ymax:bounds[3],spatialReference:{wkid:4326}})});
    try{
      var response=await fetch(endpoint+'?'+params.toString(),{signal:controller.signal});if(!response.ok)throw new Error('locator');
      var data=await response.json();if(current!==serial)return;if(data.error)throw new Error('locator');
      if(data.spatialReference&&data.spatialReference.wkid!==4326&&data.spatialReference.latestWkid!==4326)throw new Error('projection');
      var seen=new Set(),candidates=(data.candidates||[]).filter(function(c){var p=c.location;if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(c.score)||c.score<90||p.x<bounds[0]||p.x>bounds[2]||p.y<bounds[1]||p.y>bounds[3]||!window.UnderStreetData.contains(p.x,p.y))return false;var name=c.address||c.attributes&&c.attributes.Match_addr;if(!name)return false;var key=name.toLowerCase()+'|'+p.x.toFixed(6)+'|'+p.y.toFixed(6);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,5);
      if(!candidates.length){message('No matching Saint Paul address. Include the street number and street name.');return;}
      message('Choose the matching address.');candidates.forEach(function(c){var button=document.createElement('button');button.type='button';button.textContent=c.address||c.attributes.Match_addr;button.addEventListener('click',function(){matches.replaceChildren();message('Showing '+button.textContent+'.');host.dispatchEvent(new CustomEvent('understreet:locate',{detail:{lon:c.location.x,lat:c.location.y,label:button.textContent}}));host.querySelector('canvas').focus({preventScroll:true});});matches.append(button);});
      matches.querySelector('button').focus({preventScroll:true});
    }catch(err){if(err.name!=='AbortError'&&current===serial)message('Address search could not load. Try again, or browse the map.');}
    finally{clearTimeout(timer);if(current===serial){request=null;submit.disabled=false;submit.textContent='Find';}}
  });
})();
