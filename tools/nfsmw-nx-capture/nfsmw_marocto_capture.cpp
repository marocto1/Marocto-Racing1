#include "nfsmw_marocto_capture.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <iomanip>
#include <mutex>
#include <sstream>
#include <string>
#include <vector>

namespace marocto::mwcapture {
namespace {

struct CapturedDraw {
  uint64_t frame = 0;
  uint32_t vs = 0;
  int32_t ps = -1;
  uint64_t object = 0;
  uint64_t material_key = 0;
  std::string role;
  std::string material;
  std::string tag;
  std::vector<float> positions;
  std::vector<float> normals;
  std::vector<float> uvs;
  std::vector<uint32_t> indices;
};

std::mutex g_mutex;
std::filesystem::path g_output;
uint64_t g_last_checked_frame = UINT64_MAX;
uint64_t g_capture_frame = UINT64_MAX;
std::vector<CapturedDraw> g_draws;
constexpr size_t kMaxDraws = 10000;
constexpr size_t kMaxVertices = 2'000'000;

std::string Escape(std::string_view value) {
  std::string out;
  out.reserve(value.size() + 8);
  for (const unsigned char c : value) {
    switch (c) {
      case '\\': out += "\\\\"; break;
      case '"': out += "\\\""; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) {
          char tmp[7];
          std::snprintf(tmp, sizeof(tmp), "\\u%04x", unsigned(c));
          out += tmp;
        } else {
          out += char(c);
        }
    }
  }
  return out;
}

template <typename T>
void WriteArray(std::ostream& out, std::span<const T> values) {
  out << '[';
  for (size_t i = 0; i < values.size(); ++i) {
    if (i) out << ',';
    out << values[i];
  }
  out << ']';
}

void WriteNowLocked() {
  if (g_output.empty() || g_draws.empty()) return;
  std::error_code ec;
  std::filesystem::create_directories(g_output / "marocto_capture", ec);
  if (ec) return;
  const auto target = g_output / "marocto_capture" / "raw-draws.json";
  const auto temporary = g_output / "marocto_capture" / "raw-draws.json.tmp";
  std::ofstream out(temporary, std::ios::binary | std::ios::trunc);
  if (!out) return;
  out << std::setprecision(9);
  out << "{\n  \"format\":\"marocto-mw-draw-stream\",\n  \"version\":1,\n";
  out << "  \"source\":\"nfsmw-nx-x360-native-renderer\",\n";
  out << "  \"axes\":{\"forward\":\"z\",\"up\":\"y\"},\n";
  out << "  \"metadata\":{\"phase\":\"models-phase5-materials\",\"frame\":"
      << g_capture_frame << ",\"draws\":" << g_draws.size() << "},\n";
  out << "  \"draws\":[\n";
  for (size_t d = 0; d < g_draws.size(); ++d) {
    const auto& draw = g_draws[d];
    if (d) out << ",\n";
    std::ostringstream key;
    key << std::hex << std::setfill('0') << std::setw(16) << draw.material_key;
    out << "    {\"id\":" << d << ",\"frame\":" << draw.frame
        << ",\"role\":\"" << Escape(draw.role)
        << "\",\"material\":\"" << Escape(draw.material)
        << "\",\"materialKey\":\"0x" << key.str()
        << "\",\"tag\":\"" << Escape(draw.tag)
        << "\",\"shader\":\"vs" << draw.vs << "_ps" << draw.ps
        << "\",\"object\":" << draw.object << ",\"positions\":";
    WriteArray<float>(out, draw.positions);
    if (!draw.normals.empty()) {
      out << ",\"normals\":";
      WriteArray<float>(out, draw.normals);
    }
    if (!draw.uvs.empty()) {
      out << ",\"uvs\":";
      WriteArray<float>(out, draw.uvs);
    }
    out << ",\"indices\":";
    WriteArray<uint32_t>(out, draw.indices);
    out << '}';
  }
  out << "\n  ]\n}\n";
  out.close();
  if (!out) return;
  std::filesystem::rename(temporary, target, ec);
  if (ec) {
    std::filesystem::remove(target, ec);
    ec.clear();
    std::filesystem::rename(temporary, target, ec);
  }
}

void ClearLocked() {
  g_draws.clear();
  g_capture_frame = UINT64_MAX;
}

}  // namespace

void SetOutputDirectory(const std::filesystem::path& directory) {
  std::lock_guard lock(g_mutex);
  g_output = directory;
}

bool WantsFrame(uint64_t frame) {
  std::lock_guard lock(g_mutex);
  if (g_output.empty()) return false;
  if (g_capture_frame != UINT64_MAX) return g_capture_frame == frame;
  if (g_last_checked_frame == frame) return false;
  g_last_checked_frame = frame;
  const auto trigger = g_output / "marocto_capture.trigger";
  std::error_code ec;
  if (!std::filesystem::exists(trigger, ec) || ec) return false;
  std::filesystem::remove(trigger, ec);
  g_capture_frame = frame;
  g_draws.clear();
  return true;
}

void SubmitTriangleDraw(const DrawInfo& info,
                        std::span<const float> positions,
                        std::span<const uint32_t> indices) {
  SubmitTriangleDraw(info, positions, {}, {}, indices);
}

void SubmitTriangleDraw(const DrawInfo& info,
                        std::span<const float> positions,
                        std::span<const float> normals,
                        std::span<const float> uvs,
                        std::span<const uint32_t> indices) {
  std::lock_guard lock(g_mutex);
  if (info.frame != g_capture_frame || positions.empty() || indices.empty()) return;
  if (positions.size() % 3 || indices.size() % 3) return;
  const size_t vertex_count = positions.size() / 3;
  if (!vertex_count || vertex_count > kMaxVertices || g_draws.size() >= kMaxDraws) return;
  if (!normals.empty() && normals.size() != vertex_count * 3) return;
  if (!uvs.empty() && uvs.size() != vertex_count * 2) return;
  const auto finite = [](float v) { return std::isfinite(v); };
  if (std::any_of(positions.begin(), positions.end(), [&](float v) { return !finite(v); })) return;
  if (std::any_of(normals.begin(), normals.end(), [&](float v) { return !finite(v); })) return;
  if (std::any_of(uvs.begin(), uvs.end(), [&](float v) { return !finite(v); })) return;
  if (std::any_of(indices.begin(), indices.end(), [vertex_count](uint32_t i) { return i >= vertex_count; })) return;
  CapturedDraw captured;
  captured.frame = info.frame;
  captured.vs = info.vs;
  captured.ps = info.ps;
  captured.object = info.object;
  captured.material_key = info.material_key;
  captured.role.assign(info.role.begin(), info.role.end());
  captured.material.assign(info.material.begin(), info.material.end());
  captured.tag.assign(info.tag.begin(), info.tag.end());
  captured.positions.assign(positions.begin(), positions.end());
  captured.normals.assign(normals.begin(), normals.end());
  captured.uvs.assign(uvs.begin(), uvs.end());
  captured.indices.assign(indices.begin(), indices.end());
  g_draws.push_back(std::move(captured));
}

void FinishFrame(uint64_t frame) {
  std::lock_guard lock(g_mutex);
  if (g_capture_frame == UINT64_MAX || frame == g_capture_frame) return;
  WriteNowLocked();
  ClearLocked();
}

void Flush() {
  std::lock_guard lock(g_mutex);
  WriteNowLocked();
  ClearLocked();
}

}  // namespace marocto::mwcapture
