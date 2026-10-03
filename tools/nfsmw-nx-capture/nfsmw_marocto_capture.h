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
  // Phase 8: -1 is the sampler binding itself, 0..5 are +X,-X,+Y,-Y,+Z,-Z cubemap faces.
  int32_t cube_face = -1;
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

// Phase 7+: record sampler identity even when pixels are not exported.
void SubmitTextureBinding(const TextureInfo& info);

// Phase 6+ path: decoded base-level RGBA8 pixels. Phase 8 accepts six cube_face entries for cubemaps.
void SubmitTextureRgba(const TextureInfo& info, std::span<const uint8_t> rgba);

void FinishFrame(uint64_t frame);
void Flush();

}  // namespace marocto::mwcapture
