import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 }
  });

  const svgContent = fs.readFileSync(path.join(process.cwd(), 'public', 'favicon.svg'), 'utf-8');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@900&display=swap');
      </style>
    </head>
    <body style="margin: 0; padding: 0; width: 1200px; height: 630px; background-color: #121212; display: flex; align-items: center; justify-content: center; font-family: 'Inter', system-ui, sans-serif;">
      <div style="display: flex; align-items: center; gap: 32px; filter: drop-shadow(0 10px 15px rgba(0,0,0,0.5));">
        <div style="width: 128px; height: 128px;">
          ${svgContent}
        </div>
        <h1 style="font-size: 112px; font-weight: 900; letter-spacing: -6px; margin: 0; color: #ffffff;">
          <span style="color: #3b82f6;">JANOSIK</span> UMYTY
        </h1>
      </div>
    </body>
    </html>
  `;

  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(process.cwd(), 'public', 'og-image.png') });
  await browser.close();
  console.log('og-image.png generated');
})();
