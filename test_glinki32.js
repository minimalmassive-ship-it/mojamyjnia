const q = `[out:json][timeout:25];(node(around:200,53.1062,18.0225);way(around:200,53.1062,18.0225););out tags;`;
fetch('https://overpass-api.de/api/interpreter', {method:'POST', headers:{'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'MojaMyjnia/1.0'}, body:'data='+encodeURIComponent(q)})
.then(r=>r.json())
.then(d=>{
  console.log('Total objects:', d.elements.length);
  const places = d.elements.filter(e => Object.keys(e.tags || {}).length > 0 && e.tags.name);
  console.log('Places with name:', places.map(e => e.tags.name + ' (' + (e.tags.amenity || e.tags.shop || e.tags.building || 'other') + ')'));
})
.catch(e => console.error(e));
