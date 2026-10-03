#pragma once

#include <cstdint>
#include <filesystem>
#include <span>
#include <string_view>

namespace marocto::mwcapture {

struct DrawInfo {
  uint64_t frame = 0;
  uint32_t vs = 0;
  int32_t ps = -1;
  uint64_t object = 0;
  uint64_t material_key = 0;
  std::string_view role = "auto";
  std::string_view material = "default";
  std::string_view tag = {};
};

void SetOutputDirectory(const std::filesystem::path& directory);
bool WantsFrame(uint64_t frame);

// Phase 4-compatible geometry-only overload.
void SubmitTriangleDraw(const DrawInfo& info,
                        std::span<const float> positions,
                        std::span<const uint32_t> indices);

// Phase 5 path. normals = xyz per vertex, uvs = uv per vertex. Empty spans are valid.
void SubmitTriangleDraw(const DrawInfo& info,
                        std::span<const float> positions,
                        std::span<const float> normals,
                        std::span<const float> uvs,
                        std::span<const uint32_t> indices);

void FinishFrame(uint64_t frame);
void Flush();

}  // namespace marocto::mwcapture
