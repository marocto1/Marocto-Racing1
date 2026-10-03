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
# Upgrade an older Phase 4 patch in-place when present.
$text = [regex]::Replace($text, '(?s)\s*// MAROCTO_MW_CAPTURE_PHASE4.*?(?=    // Diagnostic: one line per combination of VS, PS and render target \(at most 32\)\.)', "`r`n")
$text = [regex]::Replace($text, '(?s)\s*// MAROCTO_MW_CAPTURE_PHASE5.*?(?=    // Diagnostic: one line per combination of VS, PS and render target \(at most 32\)\.)', "`r`n")

$block = @'
    // MAROCTO_MW_CAPTURE_PHASE5
    // Capture after nfsmw-nx has resolved Xenos vertex fetches and triangle indices.
    // Locations follow nfsmw-nx/XenosRecomp USAGE_LOCATIONS: position=0, normal=1, texcoord0=4.
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
            // Stable material identity from shaders plus every pixel-sampler fetch constant. We do not copy
            // proprietary texture pixels here; this key preserves material boundaries for the later texture stage.
            uint64_t material_key = UINT64_C(1469598103934665603);
            const auto mix = [&](uint32_t value) mutable { material_key ^= value; material_key *= UINT64_C(1099511628211); };
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
          }
        }
      }
    }

'@
$text = $text.Replace($anchor, $block + $anchor)
Set-Content $draws $text -Encoding UTF8
Write-Host 'Marocto MW capture Phase 5 patch applied.' -ForegroundColor Green
Write-Host 'Build nfsmw-nx normally, open a car in the garage, then run CAPTURE_MW_CAR.cmd.'
