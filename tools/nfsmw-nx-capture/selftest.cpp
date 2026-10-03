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

  const std::vector<uint8_t> rgba = {
      255,0,0,255, 0,255,0,255,
      0,0,255,255, 255,255,255,255,
  };
  marocto::mwcapture::TextureInfo texture;
  texture.material_key = info.material_key;
  texture.sampler = 0;
  texture.address = 0x00123000;
  texture.format = 6;
  texture.width = 2;
  texture.height = 2;
  texture.swizzle = 0x688;
  texture.endian = 0;
  texture.tiled = false;
  marocto::mwcapture::SubmitTextureRgba(texture, rgba);

  marocto::mwcapture::FinishFrame(43);
  const auto raw = out / "marocto_capture" / "raw-draws.json";
  if (!std::filesystem::exists(raw) || std::filesystem::file_size(raw) < 250) {
    std::cerr << "raw-draws.json was not written\n";
    return 3;
  }
  const auto pixels = out / "marocto_capture" / "textures" /
                      "mwtex_123456789abcdef0_s0_a00123000.rgba";
  if (!std::filesystem::exists(pixels) || std::filesystem::file_size(pixels) != rgba.size()) {
    std::cerr << "texture RGBA sidecar was not written\n";
    return 4;
  }
  std::cout << raw.string() << '\n';
  return 0;
}