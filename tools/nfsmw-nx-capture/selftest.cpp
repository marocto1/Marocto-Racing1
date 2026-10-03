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
  const std::vector<uint32_t> indices = {0, 1, 2};
  marocto::mwcapture::DrawInfo info;
  info.frame = 42;
  info.vs = 123;
  info.ps = 456;
  info.object = 0x123400;
  info.material = "vs123_ps456";
  info.tag = "selftest";
  marocto::mwcapture::SubmitTriangleDraw(info, positions, indices);
  marocto::mwcapture::FinishFrame(43);
  const auto raw = out / "marocto_capture" / "raw-draws.json";
  if (!std::filesystem::exists(raw) || std::filesystem::file_size(raw) < 100) {
    std::cerr << "raw-draws.json was not written\n";
    return 3;
  }
  std::cout << raw.string() << '\n';
  return 0;
}
