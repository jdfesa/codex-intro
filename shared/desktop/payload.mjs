import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {installRenderer} from './renderer.mjs';
export async function buildInjection(root){
  const [html,css,skin,settings,contours,animation,avatar,artwork,specialElite,ocrA]=await Promise.all([
    'shared/web/index.html','shared/web/style.css','shared/desktop/wallpaper.css','shared/web/image-settings.js','shared/web/assets/contours.js','shared/web/animation.js','shared/web/assets/artificial-girl-avatar.jpg','shared/web/assets/artwork.jpg',
    'shared/web/assets/fonts/special-elite-regular.ttf','shared/web/assets/fonts/ocr-a.ttf'
  ].map(name=>readFile(join(root,name))));
  const payload={html:html.toString().replace(/<!doctype[^>]*>/ig,'').replace(/<html[^>]*>|<\/html>/ig,'')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/ig,'').replace(/<link\b[^>]*>/ig,'')
    .replace(/<meta\b[^>]*http-equiv[^>]*>/ig,'').replace(/src="assets\/[^"]*"/g,'src=""'),
    css:css.toString(),skin:skin.toString(),assets:{avatar:'data:image/jpeg;base64,'+avatar.toString('base64'),artwork:'data:image/jpeg;base64,'+artwork.toString('base64')},
    fonts:[{family:'Special Elite',base64:specialElite.toString('base64')},{family:'OCR A',base64:ocrA.toString('base64')}]};
  // Bind animation globals to the temporary iframe so removing it stops its work.
  const mount=`function(window){const document=window.document,location=window.location,performance=window.performance,indexedDB=window.indexedDB,Image=window.Image,Path2D=window.Path2D,URL=window.URL,module=undefined;const requestAnimationFrame=window.requestAnimationFrame.bind(window),cancelAnimationFrame=window.cancelAnimationFrame.bind(window);\n${settings}\n${contours}\n${animation}\n}`;
  return `(${installRenderer.toString()})(${JSON.stringify(payload)},${mount})`;
}
