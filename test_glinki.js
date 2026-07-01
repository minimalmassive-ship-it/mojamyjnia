const q = `[out:json][timeout:25];(node["amenity"="car_wash"](around:2000,53.1062,18.0225);way["amenity"="car_wash"](around:2000,53.1062,18.0225);node["car_wash"="yes"](around:2000,53.1062,18.0225);way["car_wash"="yes"](around:2000,53.1062,18.0225););out center;`;
fetch('https://overpass-api.de/api/interpreter', {method:'POST', headers:{'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'MojaMyjnia/1.0'}, body:'data='+encodeURIComponent(q)})
.then(r=>r.json())
.then(d=>{
  console.log('Results:', d.elements.length);
  d.elements.forEach(e => {
    const lat = e.lat || e.center?.lat;
    const lon = e.lon || e.center?.lon;
    const dist = calculateDistance(53.1062, 18.0225, lat, lon);
    console.log(e.id, e.tags?.name, e.tags?.brand, dist.toFixed(3) + 'km', 'isCarWashYes:', e.tags?.car_wash === 'yes');
  });
})
.catch(e => console.error(e));
function calculateDistance(lat1, lon1, lat2, lon2) { const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180; const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2); const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); return R * c; }
