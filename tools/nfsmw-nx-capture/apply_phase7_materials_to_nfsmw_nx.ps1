param(
  [Parameter(Mandatory=$true)][string]$NfsmwNxRoot
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path $NfsmwNxRoot).Path
$src=Join-Path $root 'app/src'
$draws=Join-Path $src 'nfsmw_nativo_dibujos.cpp'
$shaderH=Join-Path $src 'nfsmw_nativo_shaders.h'
$shaderCpp=Join-Path $src 'nfsmw_nativo_shaders.cpp'
$here=Split-Path -Parent $MyInvocation.MyCommand.Path
if (!(Test-Path $draws) -or !(Test-Path $shaderH) -or !(Test-Path $shaderCpp)) { throw 'nfsmw-nx native renderer/shader sources are missing.' }

# Make reruns idempotent: Phase 6 installer does not know about the newer Phase 7 marker.
$pre=Get-Content $draws -Raw
$pre=[regex]::Replace($pre,'(?s)\s*// MAROCTO_MW_CAPTURE_PHASE7.*?(?=    // Diagnostic: one line per combination of VS, PS and render target \(at most 32\)\.)',"`r`n")
Set-Content $draws $pre -Encoding UTF8

& (Join-Path $here 'apply_to_nfsmw_nx.ps1') -NfsmwNxRoot $root

# Preserve sampler constant names from the original 2005 D3D constant table.
$h=Get-Content $shaderH -Raw
if ($h -notmatch '#include <string>') {
  $anchor='#include <span>'
  if (-not $h.Contains($anchor)) { throw 'Sampler header include anchor not found.' }
  $h=$h.Replace($anchor,$anchor+"`r`n#include <string>")
}
if ($h -notmatch 'std::string nombre;') {
  $anchor='  uint16_t tipo = 0;  // D3DXPARAMETER_TYPE: 10-12 = 2D, 13 = 3D, 14 = cubo'
  if (-not $h.Contains($anchor)) { throw 'SamplerShader type anchor not found.' }
  $h=$h.Replace($anchor,$anchor+"`r`n  std::string nombre;  // original constant-table sampler name, used only by the Marocto capture patch")
}
Set-Content $shaderH $h -Encoding UTF8

$c=Get-Content $shaderCpp -Raw
if ($c -notmatch 'sampler\.nombre\.assign') {
  $anchor='    sampler.tipo = c.Hay(base + tipo, 4) ? c.U16(base + tipo + 2) : 0;'
  if (-not $c.Contains($anchor)) { throw 'Sampler parser type anchor not found.' }
  $insert=@'
    const size_t nombre_pos = base + size_t(c.U32(p));
    if (nombre_pos < c.o.size()) {
      size_t nombre_fin = nombre_pos;
      while (nombre_fin < c.o.size() && c.o[nombre_fin] != 0 && nombre_fin - nombre_pos < 127) ++nombre_fin;
      if (nombre_fin < c.o.size()) sampler.nombre.assign(reinterpret_cast<const char*>(c.o.data() + nombre_pos), nombre_fin - nombre_pos);
    }
'@
  $c=$c.Replace($anchor,$anchor+"`r`n"+$insert.TrimEnd())
}
Set-Content $shaderCpp $c -Encoding UTF8

$text=Get-Content $draws -Raw
$text=$text.Replace('// MAROCTO_MW_CAPTURE_PHASE6','// MAROCTO_MW_CAPTURE_PHASE7')
$text=$text.Replace('// Geometry + UV + material capture, plus decoded base-level 2D textures from guest memory.','// Geometry + UV + full material sampler capture, plus decoded base-level 2D textures from guest memory.')
$old='              if (s.registro >= 16 || s.tipo < 10 || s.tipo > 12) continue;  // 2D samplers only'
$new='              if (s.registro >= 16 || s.tipo < 10 || s.tipo > 14) continue;  // 2D/3D/cube metadata; supported 2D pixels below'
if (-not $text.Contains($old)) { throw 'Phase 6 sampler filter anchor not found.' }
$text=$text.Replace($old,$new)
$old='              if (!rgba8 && !dxt1 && !dxt3 && !dxt5) continue;'
$new='              const bool marocto_exportable_2d = s.tipo >= 10 && s.tipo <= 12 && (rgba8 || dxt1 || dxt3 || dxt5);'
if (-not $text.Contains($old)) { throw 'Phase 6 texture format anchor not found.' }
$text=$text.Replace($old,$new)
$old='              if (!address) continue;'
if (-not $text.Contains($old)) { throw 'Phase 6 texture address anchor not found.' }
$new=@'
              if (!address) continue;
              marocto::mwcapture::TextureInfo ti;
              ti.material_key=material_key;ti.sampler=s.registro;ti.sampler_type=s.tipo;ti.sampler_name=s.nombre;
              ti.address=address;ti.format=format;ti.width=width;ti.height=height;ti.swizzle=swizzle;ti.endian=endian;ti.tiled=tiled;
              marocto::mwcapture::SubmitTextureBinding(ti);
              if (!marocto_exportable_2d) continue;
'@
$text=$text.Replace($old,$new.TrimEnd())
$old='              if(texture_ok){marocto::mwcapture::TextureInfo ti;ti.material_key=material_key;ti.sampler=s.registro;ti.address=address;ti.format=format;ti.width=width;ti.height=height;ti.swizzle=swizzle;ti.endian=endian;ti.tiled=tiled;marocto::mwcapture::SubmitTextureRgba(ti,pixels);}'
$new='              if(texture_ok) marocto::mwcapture::SubmitTextureRgba(ti,pixels);'
if (-not $text.Contains($old)) { throw 'Phase 6 SubmitTextureRgba anchor not found.' }
$text=$text.Replace($old,$new)
Set-Content $draws $text -Encoding UTF8

Write-Host 'Marocto MW capture Phase 7 full-material patch applied.' -ForegroundColor Green
Write-Host 'Sampler names, 2D texture pixels and cube/environment sampler metadata will be captured on the triggered frame.'
