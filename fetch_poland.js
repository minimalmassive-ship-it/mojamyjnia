import fs from 'fs';

const query = `[out:json][timeout:60];
(
  node["amenity"="car_wash"](49.0, 14.0, 55.0, 24.2);
  way["amenity"="car_wash"](49.0, 14.0, 55.0, 24.2);
);
out center;`;

fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'MojaMyjnia/1.0',
    'Accept': '*/*'
  },
  body: 'data=' + encodeURIComponent(query)
})
.then(r => r.text())
.then(t => {
  fs.writeFileSync('public/poland.json', t);
  console.log('Saved to public/poland.json, length: ' + t.length);
})
.catch(console.error);
