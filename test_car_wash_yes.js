const q = `[out:json][timeout:25];(node["car_wash"="yes"](around:10000,53.1044,18.0186);way["car_wash"="yes"](around:10000,53.1044,18.0186););out center;`;
fetch('https://overpass-api.de/api/interpreter', {method:'POST', body:'data='+encodeURIComponent(q)})
  .then(r=>r.json())
  .then(d=>console.log(d.elements))
  .catch(e=>console.error(e));
