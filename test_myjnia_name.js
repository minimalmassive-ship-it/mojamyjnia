const q = `[out:json][timeout:25];(node["name"~"(?i)myjnia"](53.05,17.9,53.2,18.1);way["name"~"(?i)myjnia"](53.05,17.9,53.2,18.1););out center;`;
fetch('https://overpass-api.de/api/interpreter', {method:'POST', headers:{'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'MojaMyjnia/1.0'}, body:'data='+encodeURIComponent(q)})
.then(r=>r.json())
.then(d=>{
  const matches = d.elements.filter(e => JSON.stringify(e.tags || {}).toLowerCase().includes('glinki'));
  console.log('Found with Glinki in tags:', matches);
})
.catch(e => console.error(e));
