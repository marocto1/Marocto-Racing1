param(
  [Parameter(Mandatory=$true)][string]$NfsmwNxRoot
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path $NfsmwNxRoot).Path
$app = Join-Path $root 'app'
$src = Join-Path $app 'src'
$cmake = Join-Path $app 'CMakeLists.txt'
$draws = Join-Path $src 'nfsmw_nativo_dibujos.cpp'
if (!(Test-Path $cmake) -or !(Test-Path $draws)) { throw 'Not an nfsmw-nx checkout: app/CMakeLists.txt or nfsmw_nativo_dibujos.cpp is missing.' }
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item (Join-Path $here 'nfsmw_marocto_capture.h') (Join-Path $src 'nfsmw_marocto_capture.h') -Force
Copy-Item (Join-Path $here 'nfsmw_marocto_capture.cpp') (Join-Path $src 'nfsmw_marocto_capture.cpp') -Force

$cmakeText = Get-Content $cmake -Raw
if ($cmakeText -notmatch 'src/nfsmw_marocto_capture\.cpp') {
  $anchor = '    src/nfsmw_nativo_dibujos.cpp'
  if (-not $cmakeText.Contains($anchor)) { throw 'CMake anchor not found; nfsmw-nx changed, patch not applied.' }
  $cmakeText = $cmakeText.Replace($anchor, $anchor + "`r`n    src/nfsmw_marocto_capture.cpp")
  Set-Content $cmake $cmakeText -Encoding UTF8
}

$text = Get-Content $draws -Raw
if ($text -notmatch '#include "nfsmw_marocto_capture.h"') {
  $includeAnchor = '#include "nfsmw_nativo_dibujos.h"'
  if (-not $text.Contains($includeAnchor)) { throw 'Include anchor not found; patch not applied.' }
  $text = $text.Replace($includeAnchor, $includeAnchor + "`r`n" + '#include "nfsmw_marocto_capture.h"')
}

$anchor = '    // Diagnostic: one line per combination of VS, PS and render target (at most 32).'
if (-not $text.Contains($anchor)) { throw 'Vertex/index anchor not found; nfsmw-nx changed, patch not applied.' }
$text = [regex]::Replace($text, '(?s)\s*// MAROCTO_MW_CAPTURE_PHASE4.*?(?=    // Diagnostic: one line per combination of VS, PS and render target \(at most 32\)\.)', "`r`n")
$text = [regex]::Replace($text, '(?s)\s*// MAROCTO_MW_CAPTURE_PHASE5.*?(?=    // Diagnostic: one line per combination of VS, PS and render target \(at most 32\)\.)', "`r`n")
$text = [regex]::Replace($text, '(?s)\s*// MAROCTO_MW_CAPTURE_PHASE6.*?(?=    // Diagnostic: one line per combination of VS, PS and render target \(at most 32\)\.)', "`r`n")

$block = @'
    // MAROCTO_MW_CAPTURE_PHASE6
    // Geometry + UV + material capture, plus decoded base-level 2D textures from guest memory.
    // Texture fetch fields and tiling follow nfsmw-nx's own TrazarVertices/PrepararTextura path.
    {
      static const bool marocto_capture_init = [] {
        marocto::mwcapture::SetOutputDirectory(rex::filesystem::GetExecutableFolder());
        return true;
      }();
      (void)marocto_capture_init;
      marocto::mwcapture::FinishFrame(fotograma_);
      if ((tipo == 4 || cuadrilateros) && marocto::mwcapture::WantsFrame(fotograma_)) {
        const AtributoVertices* posicion = nullptr;
        const AtributoVertices* normal = nullptr;
        const AtributoVertices* uv0 = nullptr;
        for (const AtributoVertices& a : entrada->atributos) {
          if (a.ubicacion == 0 &&
              (a.formato == VK_FORMAT_R32G32B32A32_SFLOAT || a.formato == VK_FORMAT_R32G32B32_SFLOAT)) posicion = &a;
          else if (a.ubicacion == 1) normal = &a;
          else if (a.ubicacion == 4) uv0 = &a;
        }
        if (posicion) {
          const auto half_to_float = [](uint16_t h) {
            const uint32_t s = uint32_t(h & 0x8000) << 16;
            uint32_t e = (h >> 10) & 0x1F, m = h & 0x3FF, bits;
            if (!e) {
              if (!m) bits = s;
              else { e = 113; while ((m & 0x400) == 0) { m <<= 1; --e; } m &= 0x3FF; bits = s | (e << 23) | (m << 13); }
            } else if (e == 31) bits = s | 0x7F800000u | (m << 13);
            else bits = s | ((e + 112) << 23) | (m << 13);
            float f; std::memcpy(&f, &bits, 4); return f;
          };
          const auto decode = [&](const AtributoVertices* a, uint32_t want, std::vector<float>& out) -> bool {
            if (!a) return false;
            uint32_t available = 0;
            switch (a->formato) {
              case VK_FORMAT_R32G32_SFLOAT: case VK_FORMAT_R16G16_SFLOAT:
              case VK_FORMAT_R16G16_SNORM: case VK_FORMAT_R16G16_UNORM: available = 2; break;
              case VK_FORMAT_R32G32B32_SFLOAT: available = 3; break;
              case VK_FORMAT_R32G32B32A32_SFLOAT: case VK_FORMAT_R16G16B16A16_SFLOAT:
              case VK_FORMAT_R16G16B16A16_SNORM: case VK_FORMAT_R16G16B16A16_UNORM: available = 4; break;
              default: return false;
            }
            if (want > available) return false;
            const Origen& o = origenes[a->enlace];
            const uint32_t stride = entrada->enlaces[a->enlace].zancada;
            out.clear(); out.reserve(size_t(vertices) * want);
            for (uint32_t v = 0; v < vertices; ++v) {
              const uint64_t at = uint64_t(v) * stride + a->offset;
              auto push32 = [&](uint32_t c) {
                if (at + (c + 1) * 4 > o.bytes) return false;
                uint32_t w; std::memcpy(&w, o.datos + at + c * 4, 4);
                float f = Flotante(xenos::GpuSwap(w, o.orden));
                if (!std::isfinite(f) || std::abs(f) > 100000.0f) return false;
                out.push_back(f); return true;
              };
              auto push16f = [&](uint32_t c) {
                if (at + (c + 1) * 2 > o.bytes) return false;
                uint16_t w; std::memcpy(&w, o.datos + at + c * 2, 2); w = xenos::GpuSwap(w, o.orden);
                float f = half_to_float(w); if (!std::isfinite(f)) return false; out.push_back(f); return true;
              };
              auto push16n = [&](uint32_t c, bool unorm) {
                if (at + (c + 1) * 2 > o.bytes) return false;
                uint16_t w; std::memcpy(&w, o.datos + at + c * 2, 2); w = xenos::GpuSwap(w, o.orden);
                float f = unorm ? float(w) / 65535.0f : std::max(-1.0f, float(int16_t(w)) / 32767.0f);
                out.push_back(f); return true;
              };
              bool ok = true;
              switch (a->formato) {
                case VK_FORMAT_R32G32_SFLOAT:
                case VK_FORMAT_R32G32B32_SFLOAT:
                case VK_FORMAT_R32G32B32A32_SFLOAT:
                  for (uint32_t c=0;c<want;c++) ok = ok && push32(c); break;
                case VK_FORMAT_R16G16_SFLOAT:
                case VK_FORMAT_R16G16B16A16_SFLOAT:
                  for (uint32_t c=0;c<want;c++) ok = ok && push16f(c); break;
                case VK_FORMAT_R16G16_SNORM:
                case VK_FORMAT_R16G16B16A16_SNORM:
                  for (uint32_t c=0;c<want;c++) ok = ok && push16n(c,false); break;
                case VK_FORMAT_R16G16_UNORM:
                case VK_FORMAT_R16G16B16A16_UNORM:
                  for (uint32_t c=0;c<want;c++) ok = ok && push16n(c,true); break;
                default: return false;
              }
              if (!ok) { out.clear(); return false; }
            }
            return out.size() == size_t(vertices) * want;
          };

          std::vector<float> marocto_posiciones, marocto_normales, marocto_uvs;
          bool validas = decode(posicion, 3, marocto_posiciones);
          if (normal) decode(normal, 3, marocto_normales);
          if (uv0) decode(uv0, 2, marocto_uvs);

          std::vector<uint32_t> marocto_indices;
          if (validas) {
            if (con_indices) {
              if (indices_de_16) {
                marocto_indices.reserve(indices16_.size());
                for (uint16_t original : indices16_) {
                  const uint32_t i = uint32_t(original);
                  if (i < vmin || i > vmax) { validas = false; break; }
                  marocto_indices.push_back(i - vmin);
                }
              } else {
                marocto_indices.reserve(indices_.size());
                for (uint32_t i : indices_) {
                  if (i == UINT32_MAX || i < vmin || i > vmax) { validas = false; break; }
                  marocto_indices.push_back(i - vmin);
                }
              }
            } else {
              if ((cuenta % 3) != 0 || cuenta > vertices) validas = false;
              else { marocto_indices.reserve(cuenta); for (uint32_t i=0;i<cuenta;i++) marocto_indices.push_back(i); }
            }
          }
          if (validas && !marocto_indices.empty() && (marocto_indices.size() % 3) == 0) {
            uint64_t material_key = UINT64_C(1469598103934665603);
            auto mix = [&](uint32_t value) { material_key ^= value; material_key *= UINT64_C(1099511628211); };
            mix(p.vs->numero); mix(ps ? ps->numero : UINT32_MAX);
            if (ps) for (const SamplerShader& s : ps->samplers) {
              if (s.registro >= 16) continue;
              mix(s.registro);
              for (uint32_t k=0;k<6;k++) mix(r[kRegFetch + uint32_t(s.registro)*6 + k]);
            }
            const std::string material = fmt::format("mwmat_{:016X}", material_key);
            const std::string tag = fmt::format("vs{}_ps{}", p.vs->numero, ps ? int(ps->numero) : -1);
            marocto::mwcapture::DrawInfo info;
            info.frame = fotograma_; info.vs = p.vs->numero; info.ps = ps ? int32_t(ps->numero) : -1;
            info.object = origenes[posicion->enlace].direccion; info.material_key = material_key;
            info.role = "auto"; info.material = material; info.tag = tag;
            marocto::mwcapture::SubmitTriangleDraw(info, marocto_posiciones, marocto_normales, marocto_uvs, marocto_indices);

            // Decode the base mip of common NFSMW car-material formats. No game texture bytes are shipped
            // with the capture kit: this reads the user's own guest memory only on the requested frame.
            if (ps) for (const SamplerShader& s : ps->samplers) {
              if (s.registro >= 16 || s.tipo < 10 || s.tipo > 12) continue;  // 2D samplers only
              const uint32_t fb = kRegFetch + uint32_t(s.registro) * 6;
              const uint32_t f0=r[fb], f1=r[fb+1], f2=r[fb+2], f3=r[fb+3];
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
              const uint32_t pitch_texels=std::max<uint32_t>(((f0>>22)&0x1FF)<<5,1);
              const uint32_t pitch_blocks=((pitch_texels+block_w-1)/block_w + 31u) & ~31u;
              const uint32_t address=f1 & 0x1FFFF000, swizzle=(f3>>1)&0xFFF, endian=(f1>>6)&3;
              const bool tiled=((f0>>31)&1)!=0;
              if (!address) continue;
              const auto order=static_cast<xenos::Endian>(endian);
              std::vector<uint8_t> pixels(size_t(width)*height*4,0);
              bool texture_ok=true;
              auto read_block = [&](uint32_t bx,uint32_t by,std::array<uint8_t,16>& block)->bool {
                const int64_t offset=tiled ? int64_t(DesplazamientoMosaico2D(int32_t(bx),int32_t(by),pitch_blocks,log2_bytes))
                                           : int64_t(by)*pitch_blocks*bytes + int64_t(bx)*bytes;
                if (offset<0 || uint64_t(address)+uint64_t(offset)+bytes>UINT64_C(0x20000000)) return false;
                std::memset(block.data(),0,block.size());
                std::memcpy(block.data(),memoria_->TranslatePhysical(address+uint32_t(offset)),bytes);
                for(uint32_t o=0;o<bytes;o+=4){uint32_t word;std::memcpy(&word,block.data()+o,4);word=xenos::GpuSwap(word,order);std::memcpy(block.data()+o,&word,4);}
                return true;
              };
              auto unpack565=[](uint16_t c){return std::array<uint8_t,3>{uint8_t(((c>>11)&31)*255/31),uint8_t(((c>>5)&63)*255/63),uint8_t((c&31)*255/31)};};
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
              if(texture_ok){marocto::mwcapture::TextureInfo ti;ti.material_key=material_key;ti.sampler=s.registro;ti.address=address;ti.format=format;ti.width=width;ti.height=height;ti.swizzle=swizzle;ti.endian=endian;ti.tiled=tiled;marocto::mwcapture::SubmitTextureRgba(ti,pixels);}
            }
          }
        }
      }
    }

'@
$text = $text.Replace($anchor, $block + $anchor)
Set-Content $draws $text -Encoding UTF8
Write-Host 'Marocto MW capture Phase 6 texture patch applied.' -ForegroundColor Green
Write-Host 'Build nfsmw-nx normally, open a car in the garage, then run CAPTURE_MW_CAR.cmd.'