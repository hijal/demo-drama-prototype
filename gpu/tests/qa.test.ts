import {test} from 'node:test'
import assert from 'node:assert/strict'
import {alignDialogue,subtitles} from '../src/qa'
test('aligns exact script spelling to real speech timestamps and measures missing words',()=>{
 const result=alignDialogue([{speaker:'ada',text:'Hello, little world!',at:0}],[{word:'Hello',start:1.2,end:1.5},{word:'world',start:1.8,end:2.2}])
 assert.equal(result.wer,1/3);assert.equal(result.lines[0].start,1.2);assert.equal(result.lines[0].end,2.2);assert.equal(result.lines[0].text,'Hello, little world!')
})
test('subtitle offsets use actual durations and transition overlap',()=>{
 const srt=subtitles([{duration:6.58,transition:1,noSpeech:false,lines:[{text:'Hello.',start:1,end:2,at:0}]},{duration:4.46,transition:0,noSpeech:false,lines:[{text:'Again.',start:.5,end:1,at:0}]}])
 assert.match(srt,/00:00:01,000 --> 00:00:02,000/);assert.match(srt,/00:00:06,080 --> 00:00:06,580/)
})
test('does not invent timestamps for unmatched speech when ASR detected other words',()=>{
 assert.equal(subtitles([{duration:5,transition:0,noSpeech:false,lines:[{text:'Missing.',start:null,end:null,at:1}]}]),'')
})
