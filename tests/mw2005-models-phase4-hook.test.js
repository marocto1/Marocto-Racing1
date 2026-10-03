import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildNativeCapture,parseRawDrawStream} from '../scripts/mw-draw-capture-lib.mjs';

const cpp=readFileSync(new URL('../tools/nfsmw-nx-capture/nfsmw_marocto_capture.cpp',import.meta.url),'utf8');
const header=readFileSync(new URL('../tools/nfsmw-nx-capture/nfsmw_marocto_capture.h',import.meta.url),'utf8');
const installer=readFileSync(new URL('../tools/nfsmw-nx-capture/apply_to_nfsmw_nx.ps1',import.meta.url),'utf8');

test('Phase 4 C++ bridge writes the Phase 3 raw draw-stream contract',()=>{
  assert.match(cpp,/marocto-mw-draw-stream/);
  assert.match(cpp,/raw-draws\.json/);
  assert.match(cpp,/marocto_capture\.trigger/);
  assert.match(header,/SubmitTriangleDraw/);
  assert.match(header,/FinishFrame/);
});

test('Phase 4 installer is guarded and targets the decoded vertex/index point',()=>{
  assert.match(installer,/nfsmw_nativo_dibujos\.cpp/);
  assert.match(installer,/MAROCTO_MW_CAPTURE_PHASE4/);
  assert.match(installer,/one line per combination of VS, PS and render target/);
  assert.match(installer,/VK_FORMAT_R32G32B32A32_SFLOAT/);
  assert.match(installer,/xenos::GpuSwap/);
});

test('Phase 4 hook-shaped output can be consumed by the existing Phase 3 assembler',()=>{
  const raw={format:'marocto-mw-draw-stream',version:1,source:'nfsmw-nx-x360-native-renderer',axes:{forward:'z',up:'y'},draws:[{
    id:0,frame:42,role:'body',material:'vs123_ps456',tag:'vs123_ps456',shader:'vs123_ps456',object:0x123400,
    positions:[-1,0,-1,1,0,-1,0,1,1],indices:[0,1,2]
  }]};
  const parsed=parseRawDrawStream(raw);
  assert.equal(parsed.draws.length,1);
  const capture=buildNativeCapture(raw,{shader:'vs123_ps456'});
  assert.equal(capture.format,'marocto-mw-native-capture');
  assert.equal(capture.metadata.triangles,1);
  assert.equal(capture.body.length,1);
});
