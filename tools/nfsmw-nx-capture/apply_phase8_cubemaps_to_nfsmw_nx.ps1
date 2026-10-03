param(
  [Parameter(Mandatory=$true)][string]$NfsmwNxRoot
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path $NfsmwNxRoot).Path
$src=Join-Path $root 'app/src'
$draws=Join-Path $src 'nfsmw_nativo_dibujos.cpp'
$here=Split-Path -Parent $MyInvocation.MyCommand.Path
if (!(Test-Path $draws)) { throw 'nfsmw-nx native renderer source is missing.' }

# Remove only our Phase 8 extension on reruns. Phase 7 is then refreshed by its own idempotent installer.
$pre=Get-Content $draws -Raw
$pre=[regex]::Replace($pre,'(?s)\s*// MAROCTO_MW_CAPTURE_PHASE8_CUBEMAPS.*?(?=    // Diagnostic: one line per combination of VS, PS and render target \(at most 32\)\.)',"`r`n")
Set-Content $draws $pre -Encoding UTF8

& (Join-Path $here 'apply_phase7_materials_to_nfsmw_nx.ps1') -NfsmwNxRoot $root

$text=Get-Content $draws -Raw
if ($text -notmatch 'rex/graphics/pipeline/texture/util.h') {
  $anchor='#include "nfsmw_marocto_capture.h"'
  if (-not $text.Contains($anchor)) { throw 'Capture include anchor not found.' }
  $text=$text.Replace($anchor,$anchor+"`r`n#include <rex/graphics/pipeline/texture/util.h>")
}

$anchor='    // Diagnostic: one line per combination of VS, PS and render target (at most 32).'
if (-not $text.Contains($anchor)) { throw 'Draw diagnostic anchor not found; nfsmw-nx changed.' }

$block=@'
    // MAROCTO_MW_CAPTURE_PHASE8_CUBEMAPS
    // Decode the six base-level faces of original Xenos cube samplers. Face stride is not guessed:
    // it comes from ReX/Xenia GetGuestTextureLayout, the same Xbox 360 texture-layout subsystem used
    // by the renderer. D3D/Xenos cube order is +X,-X,+Y,-Y,+Z,-Z.
    if (ps && marocto::mwcapture::WantsFrame(fotograma_)) {
      uint64_t marocto_material_key = UINT64_C(1469598103934665603);
      auto marocto_mix = [&](uint32_t value) { marocto_material_key ^= value; marocto_material_key *= UINT64_C(1099511628211); };
      marocto_mix(p.vs->numero); marocto_mix(ps->numero);
      for (const SamplerShader& key_sampler : ps->samplers) {
        if (key_sampler.registro >= 16) continue;
        marocto_mix(key_sampler.registro);
        for (uint32_t k=0;k<6;k++) marocto_mix(r[kRegFetch + uint32_t(key_sampler.registro)*6 + k]);
      }

      for (const SamplerShader& s : ps->samplers) {
        if (s.registro >= 16 || s.tipo != 14) continue;
        const uint32_t fb = kRegFetch + uint32_t(s.registro) * 6;
        const uint32_t f0=r[fb], f1=r[fb+1], f2=r[fb+2], f3=r[fb+3], f5=r[fb+5];
        if ((f0 & 3) != 2) continue;
        const uint32_t format=f1 & 0x3F;
        const bool rgba8=(format==6 || format==14 || format==50);
        const bool dxt1=(format==18 || format==51);
        const bool dxt3=(format==19 || format==52);
        const bool dxt5=(format==20 || format==53);
        if (!rgba8 && !dxt1 && !dxt3 && !dxt5) continue;
        const uint32_t width=(f2 & 0x1FFF)+1, height=((f2>>13)&0x1FFF)+1;
        if (!width || !height || width>8192 || height>8192 || uint64_t(width)*height>33554432) continue;
        const uint32_t block_w=rgba8?1:4, block_h=rgba8?1:4;
        const uint32_t bytes=rgba8?4:(dxt1?8:16), log2_bytes=bytes==4?2:(bytes==8?3:4);
        const uint32_t blocks_x=(width+block_w-1)/block_w, blocks_y=(height+block_h-1)/block_h;
        const uint32_t pitch_div32=(f0>>22)&0x1FF;
        const uint32_t pitch_texels=std::max<uint32_t>(pitch_div32<<5,1);
        const uint32_t pitch_blocks=((pitch_texels+block_w-1)/block_w + 31u) & ~31u;
        const uint32_t base_address=f1 & 0x1FFFF000, swizzle=(f3>>1)&0xFFF, endian=(f1>>6)&3;
        const bool tiled=((f0>>31)&1)!=0, packed=((f5>>11)&1)!=0;
        if (!base_address) continue;

        const auto layout=rex::graphics::texture_util::GetGuestTextureLayout(
            xenos::DataDimension::kCube, pitch_div32, width, height, 6, tiled,
            static_cast<xenos::TextureFormat>(format), packed, true, 0);
        const uint32_t face_stride=layout.base.array_slice_stride_bytes;
        if (!face_stride || uint64_t(base_address)+uint64_t(face_stride)*5 >= UINT64_C(0x20000000)) continue;
        const auto order=static_cast<xenos::Endian>(endian);
        auto unpack565=[](uint16_t c){return std::array<uint8_t,3>{uint8_t(((c>>11)&31)*255/31),uint8_t(((c>>5)&63)*255/63),uint8_t((c&31)*255/31)};};

        for (int32_t face=0; face<6; ++face) {
          const uint32_t face_address=base_address+uint32_t(face)*face_stride;
          std::vector<uint8_t> pixels(size_t(width)*height*4,0);
          bool texture_ok=true;
          auto read_block = [&](uint32_t bx,uint32_t by,std::array<uint8_t,16>& block)->bool {
            const int64_t offset=tiled ? int64_t(DesplazamientoMosaico2D(int32_t(bx),int32_t(by),pitch_blocks,log2_bytes))
                                       : int64_t(by)*pitch_blocks*bytes + int64_t(bx)*bytes;
            if (offset<0 || uint64_t(face_address)+uint64_t(offset)+bytes>UINT64_C(0x20000000)) return false;
            std::memset(block.data(),0,block.size());
            std::memcpy(block.data(),memoria_->TranslatePhysical(face_address+uint32_t(offset)),bytes);
            for(uint32_t o=0;o<bytes;o+=4){uint32_t word;std::memcpy(&word,block.data()+o,4);word=xenos::GpuSwap(word,order);std::memcpy(block.data()+o,&word,4);}
            return true;
          };
          auto write_pixel=[&](uint32_t x,uint32_t y,std::array<uint8_t,4> c){
            if(x>=width||y>=height)return;std::array<uint8_t,4> out{};
            for(uint32_t ch=0;ch<4;ch++){const uint32_t sel=(swizzle>>(ch*3))&7;out[ch]=sel<4?c[sel]:(sel==5?255:0);}
            const size_t at=(size_t(y)*width+x)*4;for(uint32_t ch=0;ch<4;ch++)pixels[at+ch]=out[ch];
          };
          auto decode_color=[&](const uint8_t* b,bool allow_transparent,uint32_t bx,uint32_t by,const uint8_t* alpha){
            const uint16_t c0=uint16_t(b[0])|(uint16_t(b[1])<<8),c1=uint16_t(b[2])|(uint16_t(b[3])<<8);
            const auto a=unpack565(c0),c=unpack565(c1);std::array<std::array<uint8_t,4>,4> pal{};
            pal[0]={a[0],a[1],a[2],255};pal[1]={c[0],c[1],c[2],255};
            if(!allow_transparent||c0>c1){for(int k=0;k<3;k++){pal[2][k]=uint8_t((2*int(a[k])+int(c[k]))/3);pal[3][k]=uint8_t((int(a[k])+2*int(c[k]))/3);}pal[2][3]=pal[3][3]=255;}
            else{for(int k=0;k<3;k++)pal[2][k]=uint8_t((int(a[k])+int(c[k]))/2);pal[2][3]=255;pal[3]={0,0,0,0};}
            const uint32_t codes=uint32_t(b[4])|(uint32_t(b[5])<<8)|(uint32_t(b[6])<<16)|(uint32_t(b[7])<<24);
            for(uint32_t py=0;py<4;py++)for(uint32_t px=0;px<4;px++){const uint32_t i=py*4+px;auto color=pal[(codes>>(i*2))&3];if(alpha)color[3]=alpha[i];write_pixel(bx*4+px,by*4+py,color);}
          };
          for(uint32_t by=0;by<blocks_y&&texture_ok;by++)for(uint32_t bx=0;bx<blocks_x;bx++){
            std::array<uint8_t,16> block{};if(!read_block(bx,by,block)){texture_ok=false;break;}
            if(rgba8){write_pixel(bx,by,{block[0],block[1],block[2],block[3]});continue;}
            if(dxt1){decode_color(block.data(),true,bx,by,nullptr);continue;}
            std::array<uint8_t,16> alpha{};
            if(dxt3){uint64_t bits=0;for(int i=0;i<8;i++)bits|=uint64_t(block[i])<<(i*8);for(uint32_t i=0;i<16;i++)alpha[i]=uint8_t(((bits>>(i*4))&15)*17);decode_color(block.data()+8,false,bx,by,alpha.data());continue;}
            if(dxt5){
              const uint8_t a0=block[0],a1=block[1];std::array<uint8_t,8> ap{};ap[0]=a0;ap[1]=a1;
              if(a0>a1){for(int i=1;i<=6;i++)ap[i+1]=uint8_t(((7-i)*int(a0)+i*int(a1))/7);}else{for(int i=1;i<=4;i++)ap[i+1]=uint8_t(((5-i)*int(a0)+i*int(a1))/5);ap[6]=0;ap[7]=255;}
              uint64_t bits=0;for(int i=0;i<6;i++)bits|=uint64_t(block[2+i])<<(i*8);for(uint32_t i=0;i<16;i++)alpha[i]=ap[(bits>>(i*3))&7];decode_color(block.data()+8,false,bx,by,alpha.data());
            }
          }
          if(texture_ok){
            marocto::mwcapture::TextureInfo ti;
            ti.material_key=marocto_material_key;ti.sampler=s.registro;ti.sampler_type=s.tipo;ti.sampler_name=s.nombre;
            ti.address=face_address;ti.format=format;ti.width=width;ti.height=height;ti.swizzle=swizzle;ti.endian=endian;ti.tiled=tiled;ti.cube_face=face;
            marocto::mwcapture::SubmitTextureRgba(ti,pixels);
          }
        }
      }
    }

'@
$text=$text.Replace($anchor,$block+$anchor)
Set-Content $draws $text -Encoding UTF8
Write-Host 'Marocto MW capture Phase 8 real-cubemap patch applied.' -ForegroundColor Green
Write-Host 'The six Xenos cube faces are exported using ReX/Xenia guest layout and the existing RGBA/DXT decoder.'
