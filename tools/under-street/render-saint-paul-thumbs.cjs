// Render the actual city map to both preview sizes, using an owned browser.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {harness,settle,root}=require('./test-support.cjs');
(async()=>{const h=await harness(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'saint-paul-thumb-'));try{
 const {page,context}=await h.page({width:1440,height:1000},'#undermap');await settle(page);
 await page.addStyleTag({content:'#undermap .um-browser{display:none!important} #undermap .um-stage{width:1200px!important;height:630px!important;min-height:630px!important;flex:none!important} #undermap .um-explorer{display:block!important;width:1200px!important;height:630px!important}'});
 await page.waitForFunction(()=>__mapAudit.state().W===1200&&__mapAudit.state().H===630);
 await page.locator('[data-um-zoom="home"]').click();await settle(page);await page.waitForTimeout(220);
 const png=Buffer.from(await page.locator('canvas').evaluate(c=>c.toDataURL('image/png').split(',')[1]),'base64');
 const source=path.join(temp,'map.png');fs.writeFileSync(source,png);
 const assets=path.join(root,'archive/under-the-street/assets');
 execFileSync('sips',['-s','format','jpeg','-s','formatOptions','92',source,'--out',path.join(assets,'under-the-street-og.jpg')],{stdio:'ignore'});
 await page.addStyleTag({content:'#undermap .um-stage{width:600px!important;height:400px!important;min-height:400px!important} #undermap .um-explorer{width:600px!important;height:400px!important}'});
 await page.waitForFunction(()=>__mapAudit.state().W===600&&__mapAudit.state().H===400);
 await page.locator('[data-um-zoom="home"]').click();await settle(page);await page.waitForTimeout(220);
 fs.writeFileSync(source,Buffer.from(await page.locator('canvas').evaluate(c=>c.toDataURL('image/png').split(',')[1]),'base64'));
 execFileSync('sips',['-s','format','jpeg','-s','formatOptions','92',source,'--out',path.join(assets,'under-the-street.jpg')],{stdio:'ignore'});
 await context.close();if(h.errors.length||h.failures.length)throw new Error(JSON.stringify({errors:h.errors,failures:h.failures}));
 console.log('Rendered Saint Paul storm-route previews at 1200×630 and 600×400');
}finally{await h.close();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
