#pragma once

#include <cstdint>
#include <filesystem>
#include <span>
#include <string>
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

struct TextureInfo {
  uint64_t material_key = 0;
  uint32_t sampler = 0;
  uint32_t sampler_type = 0;
  std::string sampler_name;
  uint32_t address = 0;
  uint32_t format = 0;
  uint32_t width = 0;
  uint32_t height = 0;
  uint32_t swizzle = 0;
  uint32_t endian = 0;
  bool tiled = false;
};

void SetOutputDirectory(const std::filesystem::path& directory);
bool WantsFrame(uint64_t frame);

// Phase 4-compatible geometry-only overload.
void SubmitTriangleDraw(const DrawInfo& info,
                        std::span<const float> positions,
                        std::span<const uint32_t> indices);

// Phase 5+ geometry path. normals = xyz per vertex, uvs = uv per vertex. Empty spans are valid.
void SubmitTriangleDraw(const DrawInfo& info,
                        std::span<const float> positions,
                        std::span<const float> normals,
                        std::span<const float> uvs,
                        std::span<const uint32_t> indices);

// Phase 7: record sampler identity even when the texture is not a supported 2D export (for example a cube map).
void SubmitTextureBinding(const TextureInfo& info);

// Phase 6+ path: decoded base-level RGBA8 pixels. Repeated bindings are deduplicated and metadata-only entries are filled in.
void SubmitTextureRgba(const TextureInfo& info, std::span<const uint8_t> rgba);

void FinishFrame(uint64_t frame);
void Flush();

}  // namespace marocto::mwcapture
