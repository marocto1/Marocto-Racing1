#include "nfsmw_marocto_capture.h"

#include <filesystem>
#include <fstream>
#include <iostream>
#include <vector>

int main(int argc, char** argv) {
  const std::filesystem::path out = argc > 1 ? argv[1] : std::filesystem::current_path();
  std::filesystem::create_directories(out);
  marocto::mwcapture::SetOutputDirectory(out);
  {
    std::ofstream trigger(out / "marocto_capture.trigger", std::ios::trunc);
    trigger << "capture\n";
  }
  if (!marocto::mwcapture::WantsFrame(42)) {
    std::cerr << "trigger was not consumed\n";
    return 2;
  }
  const std::vector<float> positions = {
      -1.0f, 0.0f, -1.0f,
       1.0f, 0.0f, -1.0f,
       0.0f, 1.0f,  1.0f,
  };
  const std::vector<float> normals = {0,1,0, 0,1,0, 0,1,0};
  const std::vector<float> uvs = {0,0, 1,0, .5f,1};
  const std::vector<uint32_t> indices = {0, 1, 2};
  marocto::mwcapture::DrawInfo info;
  info.frame = 42;
  info.vs = 123;
  info.ps = 456;
  info.object = 0x123400;
  info.material_key = 0x123456789ABCDEF0ULL;
  info.role = "body";
  info.material = "mwmat_123456789ABCDEF0";
  info.tag = "selftest";
  marocto::mwcapture::SubmitTriangleDraw(info, positions, normals, uvs, indices);

  marocto::mwcapture::TextureInfo diffuse;
  diffuse.material_key = info.material_key;
  diffuse.sampler = 0;
  diffuse.sampler_type = 12;
  diffuse.sampler_name = "DIFFUSEMAP_SAMPLER";
  diffuse.address = 0x00123000;
  diffuse.format = 6;
  diffuse.width = 2;
  diffuse.height = 2;
  diffuse.swizzle = 0x688;
  diffuse.endian = 0;
  diffuse.tiled = false;
  marocto::mwcapture::SubmitTextureBinding(diffuse);
  const std::vector<uint8_t> rgba = {
      255,0,0,255, 0,255,0,255,
      0,0,255,255, 255,255,255,255,
  };
  marocto::mwcapture::SubmitTextureRgba(diffuse, rgba);

  marocto::mwcapture::TextureInfo environment = diffuse;
  environment.sampler = 3;
  environment.sampler_type = 14;
  environment.sampler_name = "ENVMAP_CUBE_SAMPLER";
  environment.address = 0x00500000;
  environment.width = 2;
  environment.height = 2;
  environment.cube_face = -1;
  marocto::mwcapture::SubmitTextureBinding(environment);
  for (int face = 0; face < 6; ++face) {
    auto cube = environment;
    cube.cube_face = face;
    cube.address = environment.address + uint32_t(face) * 0x1000;
    std::vector<uint8_t> face_rgba(2 * 2 * 4, 255);
    for (size_t p = 0; p < face_rgba.size(); p += 4) {
      face_rgba[p + 0] = uint8_t(30 + face * 31);
      face_rgba[p + 1] = uint8_t(220 - face * 23);
      face_rgba[p + 2] = uint8_t(45 + face * 17);
    }
    marocto::mwcapture::SubmitTextureRgba(cube, face_rgba);
  }

  marocto::mwcapture::FinishFrame(43);
  const auto raw = out / "marocto_capture" / "raw-draws.json";
  if (!std::filesystem::exists(raw) || std::filesystem::file_size(raw) < 700) {
    std::cerr << "raw-draws.json was not written\n";
    return 3;
  }
  const auto pixels = out / "marocto_capture" / "textures" /
                      "mwtex_123456789abcdef0_s0_a00123000.rgba";
  if (!std::filesystem::exists(pixels) || std::filesystem::file_size(pixels) != rgba.size()) {
    std::cerr << "texture RGBA sidecar was not written\n";
    return 4;
  }
  const auto cube_px = out / "marocto_capture" / "textures" /
                       "mwtex_123456789abcdef0_s3_fpx_a00500000.rgba";
  const auto cube_nz = out / "marocto_capture" / "textures" /
                       "mwtex_123456789abcdef0_s3_fnz_a00505000.rgba";
  if (!std::filesystem::exists(cube_px) || !std::filesystem::exists(cube_nz) ||
      std::filesystem::file_size(cube_px) != 16 || std::filesystem::file_size(cube_nz) != 16) {
    std::cerr << "cubemap RGBA sidecars were not written\n";
    return 5;
  }
  std::cout << raw.string() << '\n';
  return 0;
}
