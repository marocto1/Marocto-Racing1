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
  std::string_view role = "body";
  std::string_view material = "default";
  std::string_view tag = {};
};

// Call once from nfsmw-nx startup / renderer initialization.
void SetOutputDirectory(const std::filesystem::path& directory);

// Checked at most once for every new frame. If a file named
// "marocto_capture.trigger" exists in the output directory, the bridge removes
// it and captures exactly this frame.
bool WantsFrame(uint64_t frame);

// Positions are xyz floats. Indices MUST already be triangle-list indices
// local to the supplied position array. Normals/UV are intentionally optional
// in Phase 4; Marocto Racing computes face normals if they are absent.
void SubmitTriangleDraw(const DrawInfo& info,
                        std::span<const float> positions,
                        std::span<const uint32_t> indices);

// Call once when the renderer notices a frame transition. It closes a captured
// frame and writes a valid marocto-mw-draw-stream v1 JSON document.
void FinishFrame(uint64_t frame);

// Forces any pending capture to disk (safe to call at shutdown).
void Flush();

}  // namespace marocto::mwcapture
