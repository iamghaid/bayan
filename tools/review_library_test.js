/* Isolated reviewer records: never write decisions into a user's browser. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
async function run() {
  let notes = {};
  const row = {id:1467, ar:'السحور', motion_sha256:'current', schema_errors:[]};
  const context = {window:{}, localStorage:{getItem:()=>JSON.stringify(notes)},
    fetch:async()=>({ok:true,json:async()=>[row]})};
  vm.runInNewContext(fs.readFileSync('review-library.js','utf8'),context);
  const library = context.window.BayanReviewLibrary;
  const source = [{text:'السحور',action:'pending'},{text:'غير معروف',action:'pending'},
    {text:'السحور',action:'quran'},{text:'السحور',action:'pending',reason:'reported-translation-issue'}];
  notes[1467]={decision:'accepted',motion_sha256:'current',passes:{joints:'checked',clarity:'checked',fidelity:'checked',depth:'checked'}};
  let plan=await library.apply(source);
  assert.equal(plan[0].id,1467); assert.equal(plan[0].motion_base,'sshi_motion/staging/');
  assert.equal(plan[1].action,'pending'); assert.equal(plan[2].action,'quran'); assert.equal(plan[3].action,'pending');
  assert.equal(source[0].action,'pending');
  notes[1467].decision='rejected'; assert.equal((await library.apply(source))[0].action,'pending');
  notes[1467].decision='accepted'; notes[1467].motion_sha256='old'; assert.equal((await library.apply(source))[0].action,'pending');
  notes[1467].motion_sha256='current'; notes[1467].passes={}; assert.equal((await library.apply(source))[0].id,1467); assert.equal((await library.bank()).length,1);
  console.log('Review promotion checks passed: exact label, hashes, one-click approval, rejection, protected content.');
}
run().catch(error=>{console.error(error);process.exitCode=1});
