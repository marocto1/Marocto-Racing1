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

$marker = '// MAROCTO_MW_CAPTURE_PHASE4'
if ($text -notmatch [regex]::Escape($marker)) {
  $anchor = '    // Diagnostic: one line per combination of VS, PS and render target (at most 32).'
  if (-not $text.Contains($anchor)) { throw 'Vertex/index anchor not found; nfsmw-nx changed, patch not applied.' }
  $block = @'
    // MAROCTO_MW_CAPTURE_PHASE4
    // Capture after nfsmw-nx has already decoded index endian/ranges and resolved the vertex fetches.
    // Phase 4 intentionally exports geometry only. Normals/UV/material reconstruction is a later layer.
    {
      static const bool marocto_capture_init = [] {
        marocto::mwcapture::SetOutputDirectory(rex::filesystem::GetExecutableFolder());
        return true;
      }();
      (void)marocto_capture_init;
      marocto::mwcapture::FinishFrame(fotograma_);
      if ((tipo == 4 || cuadrilateros) && marocto::mwcapture::WantsFrame(fotograma_)) {
        const AtributoVertices* posicion = nullptr;
        for (const AtributoVertices& a : entrada->atributos) {
          if (a.ubicacion == 0 &&
              (a.formato == VK_FORMAT_R32G32B32A32_SFLOAT || a.formato == VK_FORMAT_R32G32B32_SFLOAT)) {
            posicion = &a;
            break;
          }
        }
        if (posicion) {
          const Origen& origen = origenes[posicion->enlace];
          const uint32_t zancada = entrada->enlaces[posicion->enlace].zancada;
          std::vector<float> marocto_posiciones;
          marocto_posiciones.reserve(size_t(vertices) * 3);
          bool validas = true;
          for (uint32_t v = 0; v < vertices; ++v) {
            const uint64_t desde = uint64_t(v) * zancada + posicion->offset;
            if (desde + 12 > origen.bytes) { validas = false; break; }
            for (uint32_t c = 0; c < 3; ++c) {
              uint32_t palabra;
              std::memcpy(&palabra, origen.datos + desde + c * 4, 4);
              const float f = Flotante(xenos::GpuSwap(palabra, origen.orden));
              if (!std::isfinite(f) || std::abs(f) > 100000.0f) { validas = false; break; }
              marocto_posiciones.push_back(f);
            }
            if (!validas) break;
          }
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
              if ((cuenta % 3) != 0 || cuenta > vertices) {
                validas = false;
              } else {
                marocto_indices.reserve(cuenta);
                for (uint32_t i = 0; i < cuenta; ++i) marocto_indices.push_back(i);
              }
            }
          }
          if (validas && !marocto_indices.empty() && (marocto_indices.size() % 3) == 0) {
            std::string material = fmt::format("vs{}_ps{}", p.vs->numero, ps ? int(ps->numero) : -1);
            marocto::mwcapture::DrawInfo info;
            info.frame = fotograma_;
            info.vs = p.vs->numero;
            info.ps = ps ? int32_t(ps->numero) : -1;
            info.object = origen.direccion;
            info.role = "body";
            info.material = material;
            info.tag = material;
            marocto::mwcapture::SubmitTriangleDraw(info, marocto_posiciones, marocto_indices);
          }
        }
      }
    }

'@
  $text = $text.Replace($anchor, $block + $anchor)
}
Set-Content $draws $text -Encoding UTF8
Write-Host 'Marocto MW capture Phase 4 patch applied.' -ForegroundColor Green
Write-Host 'Build nfsmw-nx normally, open a car in the garage, then create marocto_capture.trigger next to the executable.'
