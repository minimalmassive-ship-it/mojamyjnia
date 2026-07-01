const query = `[out:json][timeout:25];
(
  node["amenity"="car_wash"](around:20000,53.1235,18.0084);
  way["amenity"="car_wash"](around:20000,53.1235,18.0084);
  relation["amenity"="car_wash"](around:20000,53.1235,18.0084);



);
out center;`;

fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: 'data=' + encodeURIComponent(query)
}).then(r => r.text()).then(t => {
  console.log(t.substring(0, 500));
  if (t.includes('remark')) {
    console.log('Error:', t);
  }
}).catch(console.error);
